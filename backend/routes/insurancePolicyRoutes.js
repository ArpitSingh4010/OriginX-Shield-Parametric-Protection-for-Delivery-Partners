/**
 * Express router for insurance policy subscription and management.
 *
 * Endpoints:
 *   POST  /api/insurance-policies/subscribe                - Subscribe to a weekly plan
 *   POST  /api/insurance-policies/create-payment-order     - Get Razorpay order for premium
 *   POST  /api/insurance-policies/verify-payment           - Verify payment & activate policy
 *   GET   /api/insurance-policies/metadata/pricing-model   - Pricing assumptions & exclusions
 *   GET   /api/insurance-policies/partner/:partnerId        - All policies for a partner
 *   GET   /api/insurance-policies/:policyId                 - Fetch a specific policy
 *   PATCH /api/insurance-policies/:policyId/cancel          - Cancel an active policy
 */

'use strict';

const express = require('express');
const InsurancePolicy = require('../models/InsurancePolicy');
const DeliveryPartner = require('../models/DeliveryPartner');
const {
  calculateContextualWeeklyPremium,
} = require('../services/weeklyPremiumCalculator');
const {
  createPremiumPaymentOrder,
  verifyPremiumPayment,
} = require('../services/paymentService');
const { requireAuthIfEnabled } = require('../middleware/optionalAuth');
const { validateIncomingRequest } = require('../middleware/validationMiddleware');
const {
  subscribePolicyValidators,
  policyIdParamValidators,
  deliveryPartnerIdParamValidators,
} = require('../validators/requestValidators');
const {
  INSURANCE_POLICY_STATUSES,
  COVERAGE_EXCLUSIONS,
  LOSS_RATIO_GUARDRAILS,
} = require('../config/parametricInsuranceConstants');

const insurancePolicyRouter = express.Router();
const IS_PREMIUM_PAYMENT_FLOW_ENABLED = process.env.ENABLE_PREMIUM_PAYMENT_FLOW === 'true';

// ─── POST /api/insurance-policies/subscribe ───────────────────────────────────

/**
 * Enrolls a delivery partner in a weekly insurance plan.
 *
 * Calculates the contextual premium (location + platform + earnings band)
 * and creates a policy valid for 7 days.  In stub-payment mode the policy
 * is activated immediately.  With live Razorpay, use the
 * create-payment-order → verify-payment flow instead.
 */
insurancePolicyRouter.post(
  '/subscribe',
  subscribePolicyValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const { deliveryPartnerId, selectedPlanTier } = request.body;

    const deliveryPartner = await DeliveryPartner.findById(deliveryPartnerId);
    if (!deliveryPartner) {
      return response.status(404).json({
        success: false,
        message: `No delivery partner found with ID: ${deliveryPartnerId}`,
      });
    }

    const now = new Date();
    let renewalAction = 'new_subscription';
    let previousPolicyId = null;

    if (deliveryPartner.activeInsurancePolicyId) {
      const previousPolicy = await InsurancePolicy.findById(deliveryPartner.activeInsurancePolicyId);
      if (previousPolicy) {
        previousPolicyId = previousPolicy._id;

        const hasPolicyExpiredByDate = new Date(previousPolicy.policyEndDate).getTime() < now.getTime();

        if (hasPolicyExpiredByDate) {
          if (previousPolicy.currentPolicyStatus !== INSURANCE_POLICY_STATUSES.EXPIRED) {
            previousPolicy.currentPolicyStatus = INSURANCE_POLICY_STATUSES.EXPIRED;
            await previousPolicy.save();
          }
          renewalAction = 'renew_expired';
        } else if (previousPolicy.currentPolicyStatus === INSURANCE_POLICY_STATUSES.ACTIVE) {
          // Keep a clean single-active-policy model for weekly renewals.
          previousPolicy.currentPolicyStatus = INSURANCE_POLICY_STATUSES.CANCELLED;
          previousPolicy.policyEndDate = now;
          await previousPolicy.save();
          renewalAction = 'renew_active';
        } else {
          renewalAction = 'resubscribe_after_inactive';
        }
      }
    }

    const {
      adjustedWeeklyPremiumInRupees,
      maximumCoverageInRupees,
      pricingJustification,
    } = calculateContextualWeeklyPremium({
      selectedPlanTier,
      locationRiskCategory: deliveryPartner.locationRiskCategory,
      deliveryPlatformNames: deliveryPartner.deliveryPlatformNames,
      averageMonthlyEarningsInRupees: deliveryPartner.averageMonthlyEarningsInRupees,
    });

    const policyStartDate = now;
    const policyEndDate = new Date();
    policyEndDate.setDate(policyEndDate.getDate() + 7);

    const newInsurancePolicy = new InsurancePolicy({
      deliveryPartnerId,
      selectedPlanTier: selectedPlanTier.toLowerCase(),
      weeklyPremiumChargedInRupees: adjustedWeeklyPremiumInRupees,
      maximumWeeklyCoverageInRupees: maximumCoverageInRupees,
      policyStartDate,
      policyEndDate,
      currentPolicyStatus: INSURANCE_POLICY_STATUSES.ACTIVE,
      projectedLossRatioAtEnrollment: pricingJustification.projectedLossRatio,
    });

    const savedInsurancePolicy = await newInsurancePolicy.save();

    deliveryPartner.activeInsurancePolicyId = savedInsurancePolicy._id;
    await deliveryPartner.save();

    return response.status(201).json({
      success: true,
      message: renewalAction === 'new_subscription'
        ? 'Insurance policy created successfully.'
        : 'Insurance policy renewed successfully.',
      renewalAction,
      previousPolicyId,
      insurancePolicy: {
        policyId: savedInsurancePolicy._id,
        selectedPlanTier: savedInsurancePolicy.selectedPlanTier,
        weeklyPremiumChargedInRupees: savedInsurancePolicy.weeklyPremiumChargedInRupees,
        maximumWeeklyCoverageInRupees: savedInsurancePolicy.maximumWeeklyCoverageInRupees,
        remainingCoverageInRupees: savedInsurancePolicy.remainingCoverageInRupees,
        policyStartDate: savedInsurancePolicy.policyStartDate,
        policyEndDate: savedInsurancePolicy.policyEndDate,
        coverageExclusions: savedInsurancePolicy.coverageExclusions,
        pricingJustification,
      },
    });
  } catch (policyCreationError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to create insurance policy.',
      errorDetails: policyCreationError.message,
    });
  }
  }
);

// ─── POST /api/insurance-policies/create-payment-order ────────────────────────

/**
 * Creates a Razorpay Order so the frontend can render the Checkout widget
 * for premium collection.
 *
 * Flow:
 *   1. Client calls this endpoint with deliveryPartnerId + selectedPlanTier
 *   2. Server calculates premium and creates a Razorpay Order
 *   3. Client renders Razorpay Checkout with the returned orderId
 *   4. After payment, client calls /verify-payment to activate the policy
 */
insurancePolicyRouter.post('/create-payment-order', async (request, response) => {
  try {
    if (!IS_PREMIUM_PAYMENT_FLOW_ENABLED) {
      return response.status(503).json({
        success: false,
        message:
          'Premium payment flow is currently disabled. Use /subscribe to activate policy directly.',
      });
    }

    const { deliveryPartnerId, selectedPlanTier } = request.body;

    const deliveryPartner = await DeliveryPartner.findById(deliveryPartnerId);
    if (!deliveryPartner) {
      return response.status(404).json({
        success: false,
        message: `No delivery partner found with ID: ${deliveryPartnerId}`,
      });
    }

    const {
      adjustedWeeklyPremiumInRupees,
      maximumCoverageInRupees,
      pricingJustification,
    } = calculateContextualWeeklyPremium({
      selectedPlanTier,
      locationRiskCategory: deliveryPartner.locationRiskCategory,
      deliveryPlatformNames: deliveryPartner.deliveryPlatformNames,
      averageMonthlyEarningsInRupees: deliveryPartner.averageMonthlyEarningsInRupees,
    });

    // Create a pending (inactive) policy to serve as the receipt reference.
    const policyStartDate = new Date();
    const policyEndDate = new Date();
    policyEndDate.setDate(policyEndDate.getDate() + 7);

    const pendingInsurancePolicy = new InsurancePolicy({
      deliveryPartnerId,
      selectedPlanTier: selectedPlanTier.toLowerCase(),
      weeklyPremiumChargedInRupees: adjustedWeeklyPremiumInRupees,
      maximumWeeklyCoverageInRupees: maximumCoverageInRupees,
      policyStartDate,
      policyEndDate,
      currentPolicyStatus: INSURANCE_POLICY_STATUSES.SUSPENDED, // inactive until payment verified
      projectedLossRatioAtEnrollment: pricingJustification.projectedLossRatio,
    });

    const savedPendingPolicy = await pendingInsurancePolicy.save();

    const paymentOrder = await createPremiumPaymentOrder(
      adjustedWeeklyPremiumInRupees,
      savedPendingPolicy._id.toString()
    );

    return response.status(200).json({
      success: true,
      message: 'Razorpay payment order created. Use orderId to trigger Checkout.',
      policyId: savedPendingPolicy._id,
      premium: {
        amountInRupees: adjustedWeeklyPremiumInRupees,
        coverage: maximumCoverageInRupees,
        pricingJustification,
      },
      razorpayOrder: paymentOrder,
    });
  } catch (createOrderError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to create payment order.',
      errorDetails: createOrderError.message,
    });
  }
});

// ─── POST /api/insurance-policies/verify-payment ─────────────────────────────

/**
 * Verifies the Razorpay payment signature after frontend checkout
 * and activates the insurance policy.
 */
insurancePolicyRouter.post('/verify-payment', async (request, response) => {
  try {
    if (!IS_PREMIUM_PAYMENT_FLOW_ENABLED) {
      return response.status(503).json({
        success: false,
        message:
          'Premium payment verification is currently disabled. Policy is activated via /subscribe.',
      });
    }

    const {
      policyId,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    } = request.body;

    const pendingPolicy = await InsurancePolicy.findById(policyId);
    if (!pendingPolicy) {
      return response.status(404).json({
        success: false,
        message: `No policy found with ID: ${policyId}`,
      });
    }

    const { isVerified, paymentId } = verifyPremiumPayment(
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature
    );

    if (!isVerified) {
      return response.status(400).json({
        success: false,
        message:
          'Payment verification failed — signature mismatch. Payment may be fraudulent.',
      });
    }

    // Activate the policy.
    pendingPolicy.currentPolicyStatus = INSURANCE_POLICY_STATUSES.ACTIVE;
    pendingPolicy.razorpayPaymentId = paymentId;
    await pendingPolicy.save();

    // Link policy to partner.
    await DeliveryPartner.findByIdAndUpdate(pendingPolicy.deliveryPartnerId, {
      activeInsurancePolicyId: pendingPolicy._id,
    });

    return response.status(200).json({
      success: true,
      message: 'Payment verified. Insurance policy is now active.',
      insurancePolicy: {
        policyId: pendingPolicy._id,
        currentPolicyStatus: pendingPolicy.currentPolicyStatus,
        selectedPlanTier: pendingPolicy.selectedPlanTier,
        weeklyPremiumChargedInRupees: pendingPolicy.weeklyPremiumChargedInRupees,
        maximumWeeklyCoverageInRupees: pendingPolicy.maximumWeeklyCoverageInRupees,
        policyStartDate: pendingPolicy.policyStartDate,
        policyEndDate: pendingPolicy.policyEndDate,
        razorpayPaymentId: pendingPolicy.razorpayPaymentId,
      },
    });
  } catch (verifyPaymentError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to verify payment.',
      errorDetails: verifyPaymentError.message,
    });
  }
});

// ─── GET /api/insurance-policies/metadata/pricing-model ──────────────────────

/**
 * Returns reference metadata: model assumptions, exclusions, and regulatory note.
 */
insurancePolicyRouter.get('/metadata/pricing-model', requireAuthIfEnabled, (request, response) => {
  return response.status(200).json({
    success: true,
    regulatoryNote:
      'For real-world deployment, policy issuance and pricing must be validated ' +
      'through an IRDAI-licensed insurer partner.',
    coverageExclusions: Object.values(COVERAGE_EXCLUSIONS),
    lossRatioGuardrails: LOSS_RATIO_GUARDRAILS,
  });
});

// ─── GET /api/insurance-policies/partner/:partnerId ───────────────────────────

/**
 * Retrieves all insurance policies (current and historical) for a delivery partner.
 */
insurancePolicyRouter.get(
  '/partner/:partnerId',
  deliveryPartnerIdParamValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const { partnerId } = request.params;

    const policiesForPartner = await InsurancePolicy.find({
      deliveryPartnerId: partnerId,
    })
      .sort({ policyStartDate: -1 })
      .select('-__v');

    return response.status(200).json({
      success: true,
      totalCount: policiesForPartner.length,
      insurancePolicies: policiesForPartner,
    });
  } catch (partnerPoliciesFetchError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to retrieve policies for partner.',
      errorDetails: partnerPoliciesFetchError.message,
    });
  }
  }
);

// ─── GET /api/insurance-policies/:policyId ────────────────────────────────────

/**
 * Retrieves details of a specific insurance policy.
 */
insurancePolicyRouter.get(
  '/:policyId',
  policyIdParamValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const { policyId } = request.params;

    const insurancePolicy = await InsurancePolicy.findById(policyId)
      .populate(
        'deliveryPartnerId',
        'fullName emailAddress primaryDeliveryCity deliveryPlatformNames'
      )
      .select('-__v');

    if (!insurancePolicy) {
      return response.status(404).json({
        success: false,
        message: `No insurance policy found with ID: ${policyId}`,
      });
    }

    return response.status(200).json({
      success: true,
      insurancePolicy,
    });
  } catch (policyFetchError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to retrieve insurance policy.',
      errorDetails: policyFetchError.message,
    });
  }
  }
);

// ─── PATCH /api/insurance-policies/:policyId/cancel ──────────────────────────

/**
 * Cancels an active insurance policy.
 * Clears the activeInsurancePolicyId reference on the delivery partner.
 */
insurancePolicyRouter.patch(
  '/:policyId/cancel',
  policyIdParamValidators,
  validateIncomingRequest,
  async (request, response) => {
  try {
    const { policyId } = request.params;

    const insurancePolicy = await InsurancePolicy.findById(policyId);
    if (!insurancePolicy) {
      return response.status(404).json({
        success: false,
        message: `No insurance policy found with ID: ${policyId}`,
      });
    }

    if (
      insurancePolicy.currentPolicyStatus === INSURANCE_POLICY_STATUSES.CANCELLED
    ) {
      return response.status(409).json({
        success: false,
        message: 'Insurance policy has already been cancelled.',
      });
    }

    insurancePolicy.currentPolicyStatus = INSURANCE_POLICY_STATUSES.CANCELLED;
    await insurancePolicy.save();

    // Clear the partner's active policy reference.
    await DeliveryPartner.findByIdAndUpdate(insurancePolicy.deliveryPartnerId, {
      activeInsurancePolicyId: null,
    });

    return response.status(200).json({
      success: true,
      message: 'Insurance policy cancelled successfully.',
      policyId,
      currentPolicyStatus: insurancePolicy.currentPolicyStatus,
    });
  } catch (cancelError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to cancel insurance policy.',
      errorDetails: cancelError.message,
    });
  }
  }
);

module.exports = insurancePolicyRouter;
