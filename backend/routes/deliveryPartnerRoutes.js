/**
 * Express router for delivery partner registration and profile management.
 *
 * Endpoints:
 *   POST  /api/delivery-partners/register       - Register a new delivery partner
 *   GET   /api/delivery-partners/               - List all delivery partners (paginated)
 *   GET   /api/delivery-partners/:partnerId     - Fetch a partner's full profile
 *   PATCH /api/delivery-partners/:partnerId/verify - Mark a partner as verified
 *   PATCH /api/delivery-partners/:partnerId     - Update partner details
 */

'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const DeliveryPartner = require('../models/DeliveryPartner');
const InsuranceClaim = require('../models/InsuranceClaim');
const { authenticateRequestToken, requireAdminRole } = require('../middleware/authMiddleware');
const { validateIncomingRequest } = require('../middleware/validationMiddleware');
const { assessCityRiskWithAi } = require('../services/aiIntegrationService');
const { sendPartnerVerificationEmail, sendPartnerPasswordResetEmail } = require('../services/emailService');
const { getJwtSecret } = require('../config/authConfig');
const { INSURANCE_CLAIM_STATUSES } = require('../config/parametricInsuranceConstants');
const {
  deliveryPartnerRegistrationValidators,
  deliveryPartnerLoginValidators,
  emailVerificationOtpRequestValidators,
  emailVerificationOtpVerifyValidators,
  forgotPasswordOtpRequestValidators,
  resetPasswordWithOtpValidators,
  deliveryPartnerIdParamValidators,
} = require('../validators/requestValidators');

const deliveryPartnerRouter = express.Router();
const ALLOWED_LOCATION_RISK_CATEGORIES = new Set([
  'low_risk_zone',
  'moderate_risk_zone',
  'high_risk_zone',
  'very_high_risk_zone',
]);

const OTP_EXPIRY_MINUTES = 10;
const OTP_RESEND_COOLDOWN_SECONDS = 60;
const MAX_OTP_ATTEMPTS = 5;

function getIsoWeekYearAndNumber(dateInput) {
  const date = new Date(Date.UTC(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate()));
  const dayNumber = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);

  return {
    year: date.getUTCFullYear(),
    week: weekNumber,
  };
}

function generateEmailVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function hashVerificationCode(verificationCode) {
  return crypto.createHash('sha256').update(String(verificationCode)).digest('hex');
}

async function issueAndSendEmailVerificationCode(deliveryPartner) {
  const now = new Date();

  if (deliveryPartner.emailVerificationLastSentAt) {
    const secondsSinceLastSend = Math.floor((now.getTime() - new Date(deliveryPartner.emailVerificationLastSentAt).getTime()) / 1000);
    if (secondsSinceLastSend < OTP_RESEND_COOLDOWN_SECONDS) {
      const waitSeconds = OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLastSend;
      return {
        success: false,
        statusCode: 429,
        message: `Please wait ${waitSeconds}s before requesting another verification code.`,
      };
    }
  }

  const verificationCode = generateEmailVerificationCode();
  deliveryPartner.emailVerificationOtpHash = hashVerificationCode(verificationCode);
  deliveryPartner.emailVerificationOtpExpiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);
  deliveryPartner.emailVerificationLastSentAt = now;
  deliveryPartner.emailVerificationAttemptCount = 0;
  await deliveryPartner.save();

  const emailDeliveryResult = await sendPartnerVerificationEmail({
    recipientEmailAddress: deliveryPartner.emailAddress,
    recipientFullName: deliveryPartner.fullName,
    verificationCode,
  });

  return {
    success: true,
    statusCode: 200,
    emailDeliveryResult,
  };
}

async function issueAndSendPasswordResetCode(deliveryPartner) {
  const now = new Date();

  if (deliveryPartner.passwordResetLastSentAt) {
    const secondsSinceLastSend = Math.floor((now.getTime() - new Date(deliveryPartner.passwordResetLastSentAt).getTime()) / 1000);
    if (secondsSinceLastSend < OTP_RESEND_COOLDOWN_SECONDS) {
      const waitSeconds = OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLastSend;
      return {
        success: false,
        statusCode: 429,
        message: `Please wait ${waitSeconds}s before requesting another reset code.`,
      };
    }
  }

  const resetCode = generateEmailVerificationCode();
  deliveryPartner.passwordResetOtpHash = hashVerificationCode(resetCode);
  deliveryPartner.passwordResetOtpExpiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);
  deliveryPartner.passwordResetLastSentAt = now;
  deliveryPartner.passwordResetAttemptCount = 0;
  await deliveryPartner.save();

  const emailDeliveryResult = await sendPartnerPasswordResetEmail({
    recipientEmailAddress: deliveryPartner.emailAddress,
    recipientFullName: deliveryPartner.fullName,
    resetCode,
  });

  return {
    success: true,
    statusCode: 200,
    emailDeliveryResult,
  };
}

function signPartnerAccessToken(deliveryPartner) {
  const jwtSecret = getJwtSecret();
  if (!jwtSecret) {
    return null;
  }

  return jwt.sign(
    {
      sub: deliveryPartner._id.toString(),
      role: 'partner',
      emailAddress: deliveryPartner.emailAddress,
    },
    jwtSecret,
    {
      expiresIn: '8h',
    }
  );
}

deliveryPartnerRouter.post(
  '/request-email-verification-otp',
  emailVerificationOtpRequestValidators,
  validateIncomingRequest,
  async (request, response) => {
    try {
      const normalisedEmailAddress = String(request.body.emailAddress).toLowerCase();

      const deliveryPartner = await DeliveryPartner.findOne({
        emailAddress: normalisedEmailAddress,
      }).select('+emailVerificationOtpHash +emailVerificationOtpExpiresAt +emailVerificationAttemptCount');

      if (!deliveryPartner) {
        return response.status(404).json({
          success: false,
          message: 'Delivery partner not found for this email address.',
        });
      }

      if (deliveryPartner.isEmailVerified) {
        return response.status(200).json({
          success: true,
          message: 'Email is already verified for this partner.',
        });
      }

      const otpIssueResult = await issueAndSendEmailVerificationCode(deliveryPartner);
      if (!otpIssueResult.success) {
        return response.status(otpIssueResult.statusCode).json({
          success: false,
          message: otpIssueResult.message,
        });
      }

      return response.status(200).json({
        success: true,
        message: 'Verification code sent to email address.',
        emailDelivery: otpIssueResult.emailDeliveryResult,
      });
    } catch (otpRequestError) {
      return response.status(500).json({
        success: false,
        message: 'Failed to send verification code.',
        errorDetails: otpRequestError.message,
      });
    }
  }
);

deliveryPartnerRouter.post(
  '/verify-email-otp',
  emailVerificationOtpVerifyValidators,
  validateIncomingRequest,
  async (request, response) => {
    try {
      const normalisedEmailAddress = String(request.body.emailAddress).toLowerCase();
      const verificationCode = String(request.body.verificationCode).trim();

      const deliveryPartner = await DeliveryPartner.findOne({
        emailAddress: normalisedEmailAddress,
      }).select('+emailVerificationOtpHash +emailVerificationOtpExpiresAt +emailVerificationAttemptCount');

      if (!deliveryPartner) {
        return response.status(404).json({
          success: false,
          message: 'Delivery partner not found for this email address.',
        });
      }

      if (deliveryPartner.isEmailVerified) {
        return response.status(200).json({
          success: true,
          message: 'Email already verified.',
        });
      }

      if (!deliveryPartner.emailVerificationOtpHash || !deliveryPartner.emailVerificationOtpExpiresAt) {
        return response.status(400).json({
          success: false,
          message: 'No active verification code. Please request a new code.',
        });
      }

      if (new Date(deliveryPartner.emailVerificationOtpExpiresAt).getTime() < Date.now()) {
        return response.status(400).json({
          success: false,
          message: 'Verification code expired. Please request a new code.',
        });
      }

      const isVerificationCodeValid = hashVerificationCode(verificationCode) === deliveryPartner.emailVerificationOtpHash;
      if (!isVerificationCodeValid) {
        deliveryPartner.emailVerificationAttemptCount = Number(deliveryPartner.emailVerificationAttemptCount || 0) + 1;

        if (deliveryPartner.emailVerificationAttemptCount >= MAX_OTP_ATTEMPTS) {
          deliveryPartner.emailVerificationOtpHash = null;
          deliveryPartner.emailVerificationOtpExpiresAt = null;
          await deliveryPartner.save();

          return response.status(429).json({
            success: false,
            message: 'Too many invalid OTP attempts. Request a new verification code.',
          });
        }

        await deliveryPartner.save();

        return response.status(400).json({
          success: false,
          message: 'Invalid verification code.',
        });
      }

      deliveryPartner.isEmailVerified = true;
      deliveryPartner.isAccountVerified = true;
      deliveryPartner.emailVerificationOtpHash = null;
      deliveryPartner.emailVerificationOtpExpiresAt = null;
      deliveryPartner.emailVerificationAttemptCount = 0;
      await deliveryPartner.save();

      return response.status(200).json({
        success: true,
        message: 'Email verified successfully.',
        deliveryPartner: {
          partnerId: deliveryPartner._id,
          fullName: deliveryPartner.fullName,
          emailAddress: deliveryPartner.emailAddress,
          isEmailVerified: true,
        },
      });
    } catch (otpVerifyError) {
      return response.status(500).json({
        success: false,
        message: 'Failed to verify email code.',
        errorDetails: otpVerifyError.message,
      });
    }
  }
);

deliveryPartnerRouter.post(
  '/login',
  deliveryPartnerLoginValidators,
  validateIncomingRequest,
  async (request, response) => {
    try {
      const { emailAddress, password } = request.body;

      const deliveryPartner = await DeliveryPartner.findOne({
        emailAddress: String(emailAddress).toLowerCase(),
      }).select('+passwordHash');

      if (!deliveryPartner) {
        return response.status(401).json({
          success: false,
          message: 'Invalid email or password.',
        });
      }

      const isPasswordValid = await bcrypt.compare(password, deliveryPartner.passwordHash);
      if (!isPasswordValid) {
        return response.status(401).json({
          success: false,
          message: 'Invalid email or password.',
        });
      }

      if (!deliveryPartner.isEmailVerified) {
        return response.status(403).json({
          success: false,
          message: 'Email is not verified. Please verify your email with OTP first.',
        });
      }

      const accessToken = signPartnerAccessToken(deliveryPartner);
      if (!accessToken) {
        return response.status(500).json({
          success: false,
          message: 'JWT secret is not configured on the server.',
        });
      }

      return response.status(200).json({
        success: true,
        message: 'Delivery partner logged in successfully.',
        accessToken,
        tokenType: 'Bearer',
        expiresIn: '8h',
        deliveryPartner: {
          partnerId: deliveryPartner._id,
          fullName: deliveryPartner.fullName,
          emailAddress: deliveryPartner.emailAddress,
        },
      });
    } catch (loginError) {
      return response.status(500).json({
        success: false,
        message: 'Failed to login delivery partner.',
        errorDetails: loginError.message,
      });
    }
  }
);

deliveryPartnerRouter.post(
  '/resend-otp',
  emailVerificationOtpRequestValidators,
  validateIncomingRequest,
  async (request, response) => {
    try {
      const normalisedEmailAddress = String(request.body.emailAddress).toLowerCase();

      const deliveryPartner = await DeliveryPartner.findOne({
        emailAddress: normalisedEmailAddress,
      }).select('+emailVerificationOtpHash +emailVerificationOtpExpiresAt +emailVerificationAttemptCount');

      if (!deliveryPartner) {
        return response.status(404).json({
          success: false,
          message: 'Delivery partner not found for this email address.',
        });
      }

      if (deliveryPartner.isEmailVerified) {
        return response.status(200).json({
          success: true,
          message: 'Email is already verified for this partner.',
        });
      }

      const otpIssueResult = await issueAndSendEmailVerificationCode(deliveryPartner);
      if (!otpIssueResult.success) {
        return response.status(otpIssueResult.statusCode).json({
          success: false,
          message: otpIssueResult.message,
        });
      }

      return response.status(200).json({
        success: true,
        message: 'Verification code resent successfully.',
        emailDelivery: otpIssueResult.emailDeliveryResult,
      });
    } catch (resendOtpError) {
      return response.status(500).json({
        success: false,
        message: 'Failed to resend verification code.',
        errorDetails: resendOtpError.message,
      });
    }
  }
);

deliveryPartnerRouter.post(
  '/forgot-password',
  forgotPasswordOtpRequestValidators,
  validateIncomingRequest,
  async (request, response) => {
    try {
      const normalisedEmailAddress = String(request.body.emailAddress).toLowerCase();
      const deliveryPartner = await DeliveryPartner.findOne({ emailAddress: normalisedEmailAddress })
        .select('+passwordResetOtpHash +passwordResetOtpExpiresAt +passwordResetAttemptCount');

      if (!deliveryPartner) {
        return response.status(404).json({
          success: false,
          message: 'Delivery partner not found for this email address.',
        });
      }

      const resetOtpResult = await issueAndSendPasswordResetCode(deliveryPartner);
      if (!resetOtpResult.success) {
        return response.status(resetOtpResult.statusCode).json({
          success: false,
          message: resetOtpResult.message,
        });
      }

      return response.status(200).json({
        success: true,
        message: 'Password reset code sent to email address.',
        emailDelivery: resetOtpResult.emailDeliveryResult,
      });
    } catch (forgotPasswordError) {
      return response.status(500).json({
        success: false,
        message: 'Failed to process forgot password request.',
        errorDetails: forgotPasswordError.message,
      });
    }
  }
);

deliveryPartnerRouter.post(
  '/reset-password',
  resetPasswordWithOtpValidators,
  validateIncomingRequest,
  async (request, response) => {
    try {
      const normalisedEmailAddress = String(request.body.emailAddress).toLowerCase();
      const resetCode = String(request.body.resetCode).trim();
      const newPassword = String(request.body.newPassword);

      const deliveryPartner = await DeliveryPartner.findOne({ emailAddress: normalisedEmailAddress })
        .select('+passwordHash +passwordResetOtpHash +passwordResetOtpExpiresAt +passwordResetAttemptCount');

      if (!deliveryPartner) {
        return response.status(404).json({
          success: false,
          message: 'Delivery partner not found for this email address.',
        });
      }

      if (!deliveryPartner.passwordResetOtpHash || !deliveryPartner.passwordResetOtpExpiresAt) {
        return response.status(400).json({
          success: false,
          message: 'No active reset code. Please request a new password reset code.',
        });
      }

      if (new Date(deliveryPartner.passwordResetOtpExpiresAt).getTime() < Date.now()) {
        return response.status(400).json({
          success: false,
          message: 'Reset code expired. Please request a new code.',
        });
      }

      const isResetCodeValid = hashVerificationCode(resetCode) === deliveryPartner.passwordResetOtpHash;
      if (!isResetCodeValid) {
        deliveryPartner.passwordResetAttemptCount = Number(deliveryPartner.passwordResetAttemptCount || 0) + 1;

        if (deliveryPartner.passwordResetAttemptCount >= MAX_OTP_ATTEMPTS) {
          deliveryPartner.passwordResetOtpHash = null;
          deliveryPartner.passwordResetOtpExpiresAt = null;
          await deliveryPartner.save();

          return response.status(429).json({
            success: false,
            message: 'Too many invalid reset attempts. Request a new reset code.',
          });
        }

        await deliveryPartner.save();
        return response.status(400).json({
          success: false,
          message: 'Invalid reset code.',
        });
      }

      deliveryPartner.passwordHash = await bcrypt.hash(newPassword, 10);
      deliveryPartner.passwordResetOtpHash = null;
      deliveryPartner.passwordResetOtpExpiresAt = null;
      deliveryPartner.passwordResetAttemptCount = 0;
      await deliveryPartner.save();

      return response.status(200).json({
        success: true,
        message: 'Password reset successful. You can now login with the new password.',
      });
    } catch (resetPasswordError) {
      return response.status(500).json({
        success: false,
        message: 'Failed to reset password.',
        errorDetails: resetPasswordError.message,
      });
    }
  }
);

// ─── POST /api/delivery-partners/register ────────────────────────────────────

/**
 * Registers a new delivery partner account.
 *
 * Required body fields:
 *   fullName, emailAddress, mobilePhoneNumber, primaryDeliveryCity,
 *   primaryDeliveryZoneCoordinates { latitude, longitude },
 *   deliveryPlatformNames (array)
 *
 * Optional:
 *   averageMonthlyEarningsInRupees, locationRiskCategory
 */
deliveryPartnerRouter.post(
  '/register',
  deliveryPartnerRegistrationValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const {
      fullName,
      emailAddress,
      password,
      mobilePhoneNumber,
      primaryDeliveryCity,
      primaryDeliveryZoneCoordinates,
      deliveryPlatformNames,
      averageMonthlyEarningsInRupees,
      locationRiskCategory,
    } = request.body;

    const existingPartnerWithSameEmail = await DeliveryPartner.findOne({
      emailAddress,
    });
    if (existingPartnerWithSameEmail) {
      return response.status(409).json({
        success: false,
        message: 'A delivery partner account with this email address already exists.',
      });
    }

    const existingPartnerWithSamePhone = await DeliveryPartner.findOne({
      mobilePhoneNumber,
    });
    if (existingPartnerWithSamePhone) {
      return response.status(409).json({
        success: false,
        message: 'A delivery partner account with this phone number already exists.',
      });
    }

    let resolvedRiskAssessment;
    if (locationRiskCategory !== undefined && locationRiskCategory !== null) {
      const requestedRiskCategory = String(locationRiskCategory).toLowerCase();
      if (!ALLOWED_LOCATION_RISK_CATEGORIES.has(requestedRiskCategory)) {
        return response.status(400).json({
          success: false,
          message: 'Invalid locationRiskCategory. Must be one of: low_risk_zone, moderate_risk_zone, high_risk_zone, very_high_risk_zone.',
        });
      }
      resolvedRiskAssessment = {
        source: 'request_override',
        assignedRiskCategory: requestedRiskCategory,
        computedRiskScore: null,
      };
    } else {
      resolvedRiskAssessment = await assessCityRiskWithAi(primaryDeliveryCity);
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newDeliveryPartner = new DeliveryPartner({
      fullName,
      emailAddress,
      passwordHash,
      mobilePhoneNumber,
      primaryDeliveryCity,
      primaryDeliveryZoneCoordinates,
      deliveryPlatformNames,
      averageMonthlyEarningsInRupees: averageMonthlyEarningsInRupees || null,
      locationRiskCategory: resolvedRiskAssessment.assignedRiskCategory,
      isEmailVerified: false,
      isAccountVerified: false,
    });

    const savedDeliveryPartner = await newDeliveryPartner.save();
    const otpIssueResult = await issueAndSendEmailVerificationCode(savedDeliveryPartner);

    return response.status(201).json({
      success: true,
      message: 'Delivery partner registered successfully. Verify email with OTP to activate account.',
      deliveryPartner: {
        partnerId: savedDeliveryPartner._id,
        fullName: savedDeliveryPartner.fullName,
        emailAddress: savedDeliveryPartner.emailAddress,
        primaryDeliveryCity: savedDeliveryPartner.primaryDeliveryCity,
        deliveryPlatformNames: savedDeliveryPartner.deliveryPlatformNames,
        locationRiskCategory: savedDeliveryPartner.locationRiskCategory,
        locationRiskAssessmentSource: resolvedRiskAssessment.source,
        locationRiskScore: resolvedRiskAssessment.computedRiskScore,
        accountRegistrationDate: savedDeliveryPartner.accountRegistrationDate,
        isEmailVerified: savedDeliveryPartner.isEmailVerified,
      },
      emailVerificationRequired: true,
      emailDelivery: otpIssueResult.emailDeliveryResult,
    });
  } catch (registrationError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to register delivery partner.',
      errorDetails: registrationError.message,
    });
  }
  }
);

// ─── GET /api/delivery-partners/ ─────────────────────────────────────────────

/**
 * Returns a paginated list of all registered delivery partners.
 * Supports optional filtering by city (?city=Chennai) and platform (?platform=swiggy).
 */
deliveryPartnerRouter.get('/', async (request, response) => {
  try {
    const { city, platform, verified, page = 1, limit = 20 } = request.query;

    const filterQuery = {};
    if (city) {
      filterQuery.primaryDeliveryCity = { $regex: new RegExp(city, 'i') };
    }
    if (platform) {
      filterQuery.deliveryPlatformNames = platform.toLowerCase();
    }
    if (verified !== undefined) {
      filterQuery.isAccountVerified = verified === 'true';
    }

    const pageNumber = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skipCount = (pageNumber - 1) * pageSize;

    const [deliveryPartners, totalCount] = await Promise.all([
      DeliveryPartner.find(filterQuery)
        .sort({ accountRegistrationDate: -1 })
        .skip(skipCount)
        .limit(pageSize)
        .select('-__v'),
      DeliveryPartner.countDocuments(filterQuery),
    ]);

    return response.status(200).json({
      success: true,
      totalCount,
      page: pageNumber,
      limit: pageSize,
      deliveryPartners,
    });
  } catch (listFetchError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to retrieve delivery partners.',
      errorDetails: listFetchError.message,
    });
  }
});

// ─── GET /api/delivery-partners/:partnerId ────────────────────────────────────

/**
 * Returns weekly earning vs payout trend for a delivery partner.
 */
deliveryPartnerRouter.get(
  '/:partnerId/earnings-summary',
  deliveryPartnerIdParamValidators,
  validateIncomingRequest,
  async (request, response) => {
    try {
      const { partnerId } = request.params;

      const deliveryPartner = await DeliveryPartner.findById(partnerId)
        .select('fullName primaryDeliveryCity averageMonthlyEarningsInRupees');

      if (!deliveryPartner) {
        return response.status(404).json({
          success: false,
          message: `No delivery partner found with ID: ${partnerId}`,
        });
      }

      const now = new Date();
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 7 * 7);

      const weeklyPayouts = await InsuranceClaim.aggregate([
        {
          $match: {
            deliveryPartnerId: new mongoose.Types.ObjectId(partnerId),
            claimSubmissionTimestamp: { $gte: startDate, $lte: now },
            currentClaimStatus: {
              $in: [
                INSURANCE_CLAIM_STATUSES.APPROVED_FOR_PAYOUT,
                INSURANCE_CLAIM_STATUSES.PAYOUT_PROCESSED,
              ],
            },
          },
        },
        {
          $group: {
            _id: {
              year: { $isoWeekYear: '$claimSubmissionTimestamp' },
              week: { $isoWeek: '$claimSubmissionTimestamp' },
            },
            payoutReceivedInRupees: { $sum: { $ifNull: ['$approvedPayoutAmountInRupees', 0] } },
            claimsCount: { $sum: 1 },
          },
        },
        { $sort: { '_id.year': 1, '_id.week': 1 } },
      ]);

      const payoutByWeekLabel = new Map(
        weeklyPayouts.map((weekEntry) => [
          `${weekEntry._id.year}-${weekEntry._id.week}`,
          {
            payoutReceivedInRupees: Number(weekEntry.payoutReceivedInRupees || 0),
            claimsCount: Number(weekEntry.claimsCount || 0),
          },
        ])
      );

      const estimatedWeeklyEarnings = Math.max(
        0,
        Math.round(Number(deliveryPartner.averageMonthlyEarningsInRupees || 0) / 4)
      );

      const trend = [];
      for (let offset = 7; offset >= 0; offset -= 1) {
        const weekDate = new Date(now);
        weekDate.setDate(weekDate.getDate() - offset * 7);

        const { year: weekYear, week: weekNumber } = getIsoWeekYearAndNumber(weekDate);
        const key = `${weekYear}-${weekNumber}`;
        const weekPayout = payoutByWeekLabel.get(key) || { payoutReceivedInRupees: 0, claimsCount: 0 };

        trend.push({
          label: `W${weekNumber}`,
          year: weekYear,
          week: weekNumber,
          estimatedEarningsInRupees: estimatedWeeklyEarnings,
          payoutReceivedInRupees: weekPayout.payoutReceivedInRupees,
          claimsCount: weekPayout.claimsCount,
        });
      }

      return response.status(200).json({
        success: true,
        partner: {
          partnerId,
          fullName: deliveryPartner.fullName,
          city: deliveryPartner.primaryDeliveryCity,
        },
        summary: {
          estimatedWeeklyEarningsInRupees: estimatedWeeklyEarnings,
          totalPayoutInRangeInRupees: trend.reduce((sum, entry) => sum + entry.payoutReceivedInRupees, 0),
          totalClaimsInRange: trend.reduce((sum, entry) => sum + entry.claimsCount, 0),
          weeksCovered: trend.length,
        },
        trend,
      });
    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to load earnings summary for delivery partner.',
        errorDetails: error.message,
      });
    }
  }
);

// ─── GET /api/delivery-partners/:partnerId ────────────────────────────────────

/**
 * Retrieves the full profile of a registered delivery partner by their ID.
 * Populates the active insurance policy reference.
 */
deliveryPartnerRouter.get(
  '/:partnerId',
  deliveryPartnerIdParamValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const { partnerId } = request.params;

    const deliveryPartner = await DeliveryPartner.findById(partnerId)
      .populate(
        'activeInsurancePolicyId',
        'selectedPlanTier weeklyPremiumChargedInRupees maximumWeeklyCoverageInRupees remainingCoverageInRupees currentPolicyStatus policyStartDate policyEndDate'
      )
      .select('-__v');

    if (!deliveryPartner) {
      return response.status(404).json({
        success: false,
        message: `No delivery partner found with ID: ${partnerId}`,
      });
    }

    return response.status(200).json({
      success: true,
      deliveryPartner,
    });
  } catch (profileFetchError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to retrieve delivery partner profile.',
      errorDetails: profileFetchError.message,
    });
  }
  }
);

// ─── PATCH /api/delivery-partners/:partnerId/verify ──────────────────────────

/**
 * Marks a delivery partner's account as verified.
 * In a production system this would follow KYC document validation.
 */
deliveryPartnerRouter.patch(
  '/:partnerId/verify',
  deliveryPartnerIdParamValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const { partnerId } = request.params;

    const deliveryPartner = await DeliveryPartner.findByIdAndUpdate(
      partnerId,
      { isAccountVerified: true },
      { new: true, runValidators: true }
    ).select('-__v');

    if (!deliveryPartner) {
      return response.status(404).json({
        success: false,
        message: `No delivery partner found with ID: ${partnerId}`,
      });
    }

    return response.status(200).json({
      success: true,
      message: 'Delivery partner account verified successfully.',
      deliveryPartner: {
        partnerId: deliveryPartner._id,
        fullName: deliveryPartner.fullName,
        isAccountVerified: deliveryPartner.isAccountVerified,
      },
    });
  } catch (verifyError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to verify delivery partner account.',
      errorDetails: verifyError.message,
    });
  }
  }
);

// ─── PATCH /api/delivery-partners/:partnerId ──────────────────────────────────

/**
 * Updates editable fields on a delivery partner profile.
 * Allowed fields: primaryDeliveryCity, primaryDeliveryZoneCoordinates,
 *   deliveryPlatformNames, averageMonthlyEarningsInRupees, locationRiskCategory.
 */
deliveryPartnerRouter.patch(
  '/:partnerId',
  deliveryPartnerIdParamValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const { partnerId } = request.params;

    const ALLOWED_UPDATE_FIELDS = [
      'primaryDeliveryCity',
      'primaryDeliveryZoneCoordinates',
      'deliveryPlatformNames',
      'averageMonthlyEarningsInRupees',
      'locationRiskCategory',
    ];

    const updatePayload = {};
    for (const field of ALLOWED_UPDATE_FIELDS) {
      if (request.body[field] !== undefined) {
        updatePayload[field] = request.body[field];
      }
    }

    if (Object.keys(updatePayload).length === 0) {
      return response.status(400).json({
        success: false,
        message: 'No valid fields provided for update.',
        allowedFields: ALLOWED_UPDATE_FIELDS,
      });
    }

    const updatedDeliveryPartner = await DeliveryPartner.findByIdAndUpdate(
      partnerId,
      updatePayload,
      { new: true, runValidators: true }
    ).select('-__v');

    if (!updatedDeliveryPartner) {
      return response.status(404).json({
        success: false,
        message: `No delivery partner found with ID: ${partnerId}`,
      });
    }

    return response.status(200).json({
      success: true,
      message: 'Delivery partner profile updated successfully.',
      deliveryPartner: updatedDeliveryPartner,
    });
  } catch (updateError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to update delivery partner profile.',
      errorDetails: updateError.message,
    });
  }
  }
);

// ─── DELETE /api/delivery-partners/:partnerId ───────────────────────────────

/**
 * Removes a delivery partner account.
 * Restricted to admin users only.
 */
deliveryPartnerRouter.delete(
  '/:partnerId',
  authenticateRequestToken,
  requireAdminRole,
  deliveryPartnerIdParamValidators,
  validateIncomingRequest,
  async (request, response) => {
    try {
      const { partnerId } = request.params;

      const deletedDeliveryPartner = await DeliveryPartner.findByIdAndDelete(partnerId).select('fullName emailAddress');

      if (!deletedDeliveryPartner) {
        return response.status(404).json({
          success: false,
          message: `No delivery partner found with ID: ${partnerId}`,
        });
      }

      return response.status(200).json({
        success: true,
        message: 'Delivery partner removed successfully.',
        deletedDeliveryPartner,
      });
    } catch (deleteError) {
      return response.status(500).json({
        success: false,
        message: 'Failed to remove delivery partner.',
        errorDetails: deleteError.message,
      });
    }
  }
);

module.exports = deliveryPartnerRouter;
