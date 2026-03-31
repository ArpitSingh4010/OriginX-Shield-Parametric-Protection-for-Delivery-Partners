/**
 * Mongoose model for a recorded disruption event in a specific city zone.
 *
 * When measurable environmental conditions (rainfall, temperature, AQI)
 * or administrative events (curfew, flooding) exceed the defined
 * parametric thresholds, a DisruptionEvent document is created.
 * This document is used to trigger automatic claims for all active
 * delivery partners operating in the affected zone.
 */

const mongoose = require('mongoose');
const {
  DISRUPTION_EVENT_TYPES,
  COVERAGE_EXCLUSIONS,
} = require('../config/parametricInsuranceConstants');

const disruptionEventSchema = new mongoose.Schema(
  {
    disruptionType: {
      type: String,
      enum: Object.values(DISRUPTION_EVENT_TYPES),
      required: [true, 'Disruption event type is required'],
    },

    affectedCityName: {
      type: String,
      required: [true, 'Affected city name is required'],
      trim: true,
    },

    affectedZoneCentreCoordinates: {
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },

    affectedRadiusInKilometres: {
      type: Number,
      required: [true, 'Radius of the affected zone is required'],
    },

    measuredRainfallInMillimetres: {
      type: Number,
      default: null,
    },

    measuredTemperatureInCelsius: {
      type: Number,
      default: null,
    },

    measuredAirQualityIndex: {
      type: Number,
      default: null,
    },

    disruptionStartTimestamp: {
      type: Date,
      required: [true, 'Disruption start time is required'],
    },

    disruptionEndTimestamp: {
      type: Date,
      default: null,
    },

    weatherApiDataSourceName: {
      type: String,
      trim: true,
    },

    numberOfAffectedDeliveryPartners: {
      type: Number,
      default: 0,
    },

    totalCompensationDispersedInRupees: {
      type: Number,
      default: 0,
    },

    hasAutomaticClaimTriggerBeenFired: {
      type: Boolean,
      default: false,
    },

    policyExclusionTag: {
      type: String,
      enum: [null, ...Object.values(COVERAGE_EXCLUSIONS)],
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const DisruptionEvent = mongoose.model('DisruptionEvent', disruptionEventSchema);

module.exports = DisruptionEvent;
