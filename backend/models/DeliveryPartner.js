/**
 * Mongoose model for a registered delivery partner (gig worker).
 *
 * Stores identity, contact, location, and activity information
 * required for policy enrollment and claim verification.
 */

const mongoose = require('mongoose');

const deliveryPartnerSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name of the delivery partner is required'],
      trim: true,
    },

    emailAddress: {
      type: String,
      required: [true, 'Email address is required'],
      unique: true,
      lowercase: true,
      trim: true,
    },

    mobilePhoneNumber: {
      type: String,
      required: [true, 'Mobile phone number is required'],
      unique: true,
    },

    primaryDeliveryCity: {
      type: String,
      required: [true, 'Primary delivery city is required'],
      trim: true,
    },

    primaryDeliveryZoneCoordinates: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },

    deliveryPlatformNames: {
      type: [String],
      enum: ['swiggy', 'zomato', 'dunzo', 'blinkit', 'other'],
      required: [true, 'At least one delivery platform must be specified'],
    },

    accountRegistrationDate: {
      type: Date,
      default: Date.now,
    },

    isAccountVerified: {
      type: Boolean,
      default: false,
    },

    locationRiskCategory: {
      type: String,
      enum: ['low_risk_zone', 'moderate_risk_zone', 'high_risk_zone', 'very_high_risk_zone'],
      default: 'moderate_risk_zone',
    },

    totalCompensationReceivedInRupees: {
      type: Number,
      default: 0,
    },

    activeInsurancePolicyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'InsurancePolicy',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const DeliveryPartner = mongoose.model('DeliveryPartner', deliveryPartnerSchema);

module.exports = DeliveryPartner;
