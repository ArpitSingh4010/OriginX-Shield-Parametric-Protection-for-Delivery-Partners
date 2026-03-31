const { body, param } = require('express-validator');

const deliveryPartnerRegistrationValidators = [
  body('fullName').trim().notEmpty().withMessage('fullName is required.'),
  body('emailAddress').isEmail().withMessage('emailAddress must be a valid email.'),
  body('mobilePhoneNumber').trim().notEmpty().withMessage('mobilePhoneNumber is required.'),
  body('primaryDeliveryCity').trim().notEmpty().withMessage('primaryDeliveryCity is required.'),
  body('primaryDeliveryZoneCoordinates.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('primaryDeliveryZoneCoordinates.latitude must be valid.'),
  body('primaryDeliveryZoneCoordinates.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('primaryDeliveryZoneCoordinates.longitude must be valid.'),
  body('deliveryPlatformNames')
    .isArray({ min: 1 })
    .withMessage('deliveryPlatformNames must be a non-empty array.'),
];

const deliveryPartnerIdParamValidators = [
  param('partnerId').isMongoId().withMessage('partnerId must be a valid MongoDB ID.'),
];

const subscribePolicyValidators = [
  body('deliveryPartnerId').isMongoId().withMessage('deliveryPartnerId must be a valid MongoDB ID.'),
  body('selectedPlanTier')
    .isIn(['basic', 'standard', 'premium', 'BASIC', 'STANDARD', 'PREMIUM'])
    .withMessage('selectedPlanTier must be basic, standard, or premium.'),
];

const policyIdParamValidators = [
  param('policyId').isMongoId().withMessage('policyId must be a valid MongoDB ID.'),
];

const submitClaimValidators = [
  body('deliveryPartnerId').isMongoId().withMessage('deliveryPartnerId must be a valid MongoDB ID.'),
  body('triggeringDisruptionEventId')
    .isMongoId()
    .withMessage('triggeringDisruptionEventId must be a valid MongoDB ID.'),
  body('currentEnvironmentalConditions.rainfallInMillimetres')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('rainfallInMillimetres must be a non-negative number.'),
  body('partnerLocationAtDisruptionTime.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('partnerLocationAtDisruptionTime.latitude must be valid.'),
  body('partnerLocationAtDisruptionTime.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('partnerLocationAtDisruptionTime.longitude must be valid.'),
  body('networkSignalCoordinates.latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('networkSignalCoordinates.latitude must be valid.'),
  body('networkSignalCoordinates.longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('networkSignalCoordinates.longitude must be valid.'),
  body('minutesActiveOnDeliveryPlatform')
    .isInt({ min: 0 })
    .withMessage('minutesActiveOnDeliveryPlatform must be a non-negative integer.'),
];

const claimIdParamValidators = [
  param('claimId').isMongoId().withMessage('claimId must be a valid MongoDB ID.'),
];

module.exports = {
  deliveryPartnerRegistrationValidators,
  deliveryPartnerIdParamValidators,
  subscribePolicyValidators,
  policyIdParamValidators,
  submitClaimValidators,
  claimIdParamValidators,
};
