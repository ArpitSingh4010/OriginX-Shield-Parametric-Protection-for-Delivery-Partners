/**
 * Mongoose model for a weekly insurance policy subscribed to by a delivery partner.
 *
 * Each policy tracks the plan tier, active period, premium paid,
 * maximum coverage available, and current policy status.
 */

const mongoose = require('mongoose');
const { INSURANCE_POLICY_STATUSES } = require('../config/parametricInsuranceConstants');

const insurancePolicySchema = new mongoose.Schema(
  {
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryPartner',
      required: [true, 'Delivery partner ID is required to create a policy'],
    },

    selectedPlanTier: {
      type: String,
      enum: ['basic', 'standard', 'premium'],
      required: [true, 'Insurance plan tier must be selected'],
    },

    weeklyPremiumChargedInRupees: {
      type: Number,
      required: [true, 'Weekly premium amount must be specified'],
    },

    maximumWeeklyCoverageInRupees: {
      type: Number,
      required: [true, 'Maximum weekly coverage amount must be specified'],
    },

    policyStartDate: {
      type: Date,
      required: [true, 'Policy start date is required'],
    },

    policyEndDate: {
      type: Date,
      required: [true, 'Policy end date is required'],
    },

    currentPolicyStatus: {
      type: String,
      enum: Object.values(INSURANCE_POLICY_STATUSES),
      default: INSURANCE_POLICY_STATUSES.ACTIVE,
    },

    remainingCoverageInRupees: {
      type: Number,
    },

    totalClaimsFiledThisWeek: {
      type: Number,
      default: 0,
    },

    razorpayPaymentId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * Before saving, populate remainingCoverageInRupees with the
 * maximum coverage if it has not been explicitly set.
 */
insurancePolicySchema.pre('save', function setInitialRemainingCoverage(next) {
  if (this.remainingCoverageInRupees === undefined) {
    this.remainingCoverageInRupees = this.maximumWeeklyCoverageInRupees;
  }
  next();
});

/**
 * Checks whether the policy is currently within its active date window
 * and has an active status.
 *
 * @returns {boolean} True if the policy is currently valid and active
 */
insurancePolicySchema.methods.isPolicyCurrentlyActive = function () {
  const currentDate = new Date();
  return (
    this.currentPolicyStatus === INSURANCE_POLICY_STATUSES.ACTIVE &&
    currentDate >= this.policyStartDate &&
    currentDate <= this.policyEndDate
  );
};

const InsurancePolicy = mongoose.model('InsurancePolicy', insurancePolicySchema);

module.exports = InsurancePolicy;
