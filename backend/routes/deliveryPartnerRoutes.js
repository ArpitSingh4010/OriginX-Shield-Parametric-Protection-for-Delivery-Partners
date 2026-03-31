/**
 * Express router for delivery partner registration and profile management.
 *
 * Endpoints:
 *   POST /api/delivery-partners/register  - Register a new delivery partner
 *   GET  /api/delivery-partners/:partnerId - Fetch a partner's profile
 */

const express = require('express');
const DeliveryPartner = require('../models/DeliveryPartner');

const deliveryPartnerRouter = express.Router();

/**
 * POST /api/delivery-partners/register
 *
 * Registers a new delivery partner account.
 * The request body must include name, email, phone, city, coordinates,
 * and at least one delivery platform.
 */
deliveryPartnerRouter.post('/register', async (request, response) => {
  try {
    const {
      fullName,
      emailAddress,
      mobilePhoneNumber,
      primaryDeliveryCity,
      primaryDeliveryZoneCoordinates,
      deliveryPlatformNames,
      averageMonthlyEarningsInRupees,
    } = request.body;

    const existingPartnerWithSameEmail = await DeliveryPartner.findOne({ emailAddress });
    if (existingPartnerWithSameEmail) {
      return response.status(409).json({
        success: false,
        message: 'A delivery partner account with this email address already exists.',
      });
    }

    const newDeliveryPartner = new DeliveryPartner({
      fullName,
      emailAddress,
      mobilePhoneNumber,
      primaryDeliveryCity,
      primaryDeliveryZoneCoordinates,
      deliveryPlatformNames,
      averageMonthlyEarningsInRupees,
    });

    const savedDeliveryPartner = await newDeliveryPartner.save();

    return response.status(201).json({
      success: true,
      message: 'Delivery partner registered successfully.',
      deliveryPartner: {
        partnerId: savedDeliveryPartner._id,
        fullName: savedDeliveryPartner.fullName,
        emailAddress: savedDeliveryPartner.emailAddress,
        primaryDeliveryCity: savedDeliveryPartner.primaryDeliveryCity,
        accountRegistrationDate: savedDeliveryPartner.accountRegistrationDate,
      },
    });
  } catch (registrationError) {
    return response.status(500).json({
      success: false,
      message: 'Failed to register delivery partner.',
      errorDetails: registrationError.message,
    });
  }
});

/**
 * GET /api/delivery-partners/:partnerId
 *
 * Retrieves the profile of a registered delivery partner by their ID.
 */
deliveryPartnerRouter.get('/:partnerId', async (request, response) => {
  try {
    const { partnerId } = request.params;

    const deliveryPartner = await DeliveryPartner.findById(partnerId).select(
      '-__v'
    );

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
});

module.exports = deliveryPartnerRouter;
