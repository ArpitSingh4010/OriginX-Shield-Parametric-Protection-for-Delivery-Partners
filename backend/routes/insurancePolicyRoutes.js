/**
 * Express router for insurance policy subscription and management.
 *
 * Endpoints:
 *   POST /api/insurance-policies/subscribe  - Subscribe to a weekly plan
 *   GET  /api/insurance-policies/:policyId   - Fetch a specific policy
 */

const express = require('express');
const InsurancePolicy = require('../models/InsurancePolicy');
const DeliveryPartner = require('../models/DeliveryPartner');
const { calculateAdjustedWeeklyPremium } = require('../services/weeklyPremiumCalculator');
const { INSURANCE_POLICY_STATUSES } = require('../config/parametricInsuranceConstants');

const insurancePolicyRouter = express.Router();

/**
 * POST /api/insurance-policies/subscribe
 *
 * Enrolls a delivery partner in a weekly insurance plan.
 * Calculates the adjusted premium based on the partner's location
 * risk category and creates a policy valid for 7 days.
 */
insurancePolicyRouter.post('/subscribe', async (request, response) => {
  try {
    const { deliveryPartnerId, selectedPlanTier } = request.body;

    const deliveryPartner = await DeliveryPartner.findById(deliveryPartnerId);
    if (!deliveryPartner) {
      return response.status(404).json({
        success: false,
        message: `No delivery partner found with ID: ${deliveryPartnerId}`,
      });
    }

    const { adjustedWeeklyPremiumInRupees, maximumCoverageInRupees } =
      calculateAdjustedWeeklyPremium(
        selectedPlanTier,
        deliveryPartner.locationRiskCategory
      );

    const policyStartDate = new Date();
    const policyEndDate = new Date();
    const DAYS_IN_AN_INSURANCE_WEEK = 7;
    policyEndDate.setDate(policyEndDate.getDate() + DAYS_IN_AN_INSURANCE_WEEK);

    const newInsurancePolicy = new InsurancePolicy({
      deliveryPartnerId,
      selectedPlanTier: selectedPlanTier.toLowerCase(),
      weeklyPremiumChargedInRupees: adjustedWeeklyPremiumInRupees,
      maximumWeeklyCoverageInRupees: maximumCoverageInRupees,
      policyStartDate,
      policyEndDate,
      currentPolicyStatus: INSURANCE_POLICY_STATUSES.ACTIVE,
    });

    const savedInsurancePolicy = await newInsurancePolicy.save();

    deliveryPartner.activeInsurancePolicyId = savedInsurancePolicy._id;
    await deliveryPartner.save();

    return response.status(201).json({
      success: true,
      message: 'Insurance policy created successfully.',
      insurancePolicy: {
        policyId: savedInsurancePolicy._id,
        selectedPlanTier: savedInsurancePolicy.selectedPlanTier,
        weeklyPremiumChargedInRupees: savedInsurancePolicy.weeklyPremiumChargedInRupees,
        maximumWeeklyCoverageInRupees: savedInsurancePolicy.maximumWeeklyCoverageInRupees,
        policyStartDate: savedInsurancePolicy.policyStartDate,
        policyEndDate: savedInsurancePolicy.policyEndDate,
      },
    });
  } catch (policyCreationError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to create insurance policy.',
      errorDetails: policyCreationError.message,
    });
  }
});

/**
 * GET /api/insurance-policies/:policyId
 *
 * Retrieves details of a specific insurance policy by its ID.
 */
insurancePolicyRouter.get('/:policyId', async (request, response) => {
  try {
    const { policyId } = request.params;

    const insurancePolicy = await InsurancePolicy.findById(policyId)
      .populate('deliveryPartnerId', 'fullName emailAddress primaryDeliveryCity')
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
});

module.exports = insurancePolicyRouter;
