/**
 * Mongoose model for an insurance claim raised against a disruption event.
 *
 * Claims are generated automatically when a disruption event is detected
 * and verification checks confirm the delivery partner was active in the
 * affected zone at the time of the disruption.
 */

const mongoose = require('mongoose');
const { INSURANCE_CLAIM_STATUSES } = require('../config/parametricInsuranceConstants');

const insuranceClaimSchema = new mongoose.Schema(
  {
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryPartner',
      required: [true, 'Delivery partner ID is required for a claim'],
    },

    associatedPolicyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InsurancePolicy',
      required: [true, 'Associated insurance policy ID is required'],
    },

    triggeringDisruptionEventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DisruptionEvent',
      required: [true, 'Triggering disruption event ID is required'],
    },

    claimSubmissionTimestamp: {
      type: Date,
      default: Date.now,
    },

    currentClaimStatus: {
      type: String,
      enum: Object.values(INSURANCE_CLAIM_STATUSES),
      default: INSURANCE_CLAIM_STATUSES.PENDING_VERIFICATION,
    },

    requestedCompensationAmountInRupees: {
      type: Number,
      required: [true, 'Requested compensation amount is required'],
    },

    approvedPayoutAmountInRupees: {
      type: Number,
      default: null,
    },

    partnerLocationAtDisruptionTime: {
      latitude: { type: Number },
      longitude: { type: Number },
    },

    wasPartnerActiveOnDeliveryPlatform: {
      type: Boolean,
      default: false,
    },

    estimatedDeliveryHoursLostToDisruption: {
      type: Number,
      default: 0,
    },

    fraudRiskScoreAtTimeOfClaim: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },

    fraudReviewNotes: {
      type: String,
      default: null,
    },

    payoutProcessedTimestamp: {
      type: Date,
      default: null,
    },

    razorpayPayoutTransactionId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Checks whether the claim has been approved and compensation
 * has already been disbursed to the delivery partner.
 *
 * @returns {boolean} True if the claim payout has been processed
 */
insuranceClaimSchema.methods.hasPayoutBeenDisburse = function () {
  return this.currentClaimStatus === INSURANCE_CLAIM_STATUSES.PAYOUT_PROCESSED;
};

/**
 * Checks whether this claim requires human intervention due to
 * suspected fraudulent activity.
 *
 * @returns {boolean} True if the claim has been flagged for manual review
 */
insuranceClaimSchema.methods.isFlaggedForManualFraudReview = function () {
  return this.currentClaimStatus === INSURANCE_CLAIM_STATUSES.FLAGGED_FOR_MANUAL_REVIEW;
};

const InsuranceClaim = mongoose.model('InsuranceClaim', insuranceClaimSchema);

module.exports = InsuranceClaim;
