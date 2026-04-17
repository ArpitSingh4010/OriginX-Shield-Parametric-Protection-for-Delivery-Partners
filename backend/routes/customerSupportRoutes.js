'use strict';

const express = require('express');
const mongoose = require('mongoose');
const { body } = require('express-validator');
const { authenticateRequestToken, requireAdminRole } = require('../middleware/authMiddleware');
const { validateIncomingRequest } = require('../middleware/validationMiddleware');
const DeliveryPartner = require('../models/DeliveryPartner');
const {
  CustomerSupportTicket,
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
} = require('../models/CustomerSupportTicket');

const customerSupportRouter = express.Router();

const submitSupportTicketValidators = [
  body('fullName').trim().notEmpty().withMessage('fullName is required.').isLength({ max: 100 }).withMessage('fullName must be at most 100 characters.'),
  body('emailAddress').trim().isEmail().withMessage('Valid emailAddress is required.').isLength({ max: 120 }).withMessage('emailAddress must be at most 120 characters.'),
  body('mobilePhoneNumber').optional({ values: 'falsy' }).trim().isLength({ max: 20 }).withMessage('mobilePhoneNumber must be at most 20 characters.'),
  body('deliveryPartnerId').optional({ values: 'falsy' }).isMongoId().withMessage('deliveryPartnerId must be a valid MongoDB ObjectId.'),
  body('issueCategory').optional({ values: 'falsy' }).isIn(SUPPORT_CATEGORIES).withMessage(`issueCategory must be one of: ${SUPPORT_CATEGORIES.join(', ')}`),
  body('subject').trim().notEmpty().withMessage('subject is required.').isLength({ max: 140 }).withMessage('subject must be at most 140 characters.'),
  body('message').trim().notEmpty().withMessage('message is required.').isLength({ max: 2000 }).withMessage('message must be at most 2000 characters.'),
];

customerSupportRouter.post(
  '/submit',
  submitSupportTicketValidators,
  validateIncomingRequest,
  async (request, response) => {
    try {
      const {
        fullName,
        emailAddress,
        mobilePhoneNumber,
        deliveryPartnerId,
        issueCategory,
        subject,
        message,
      } = request.body;

      if (deliveryPartnerId && !mongoose.isValidObjectId(deliveryPartnerId)) {
        return response.status(400).json({
          success: false,
          message: 'deliveryPartnerId must be a valid MongoDB ObjectId.',
        });
      }

      if (deliveryPartnerId) {
        const partnerExists = await DeliveryPartner.exists({ _id: deliveryPartnerId });
        if (!partnerExists) {
          return response.status(404).json({
            success: false,
            message: 'No delivery partner found for the provided deliveryPartnerId.',
          });
        }
      }

      const ticket = await CustomerSupportTicket.create({
        fullName,
        emailAddress,
        mobilePhoneNumber: mobilePhoneNumber || null,
        deliveryPartnerId: deliveryPartnerId || null,
        issueCategory: issueCategory || 'general',
        subject,
        message,
        source: 'web',
      });

      return response.status(201).json({
        success: true,
        message: 'Support request submitted successfully.',
        ticket: {
          ticketId: ticket._id,
          ticketStatus: ticket.ticketStatus,
          issueCategory: ticket.issueCategory,
          createdAt: ticket.createdAt,
        },
      });
    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to submit support request.',
        errorDetails: error.message,
      });
    }
  }
);

customerSupportRouter.get('/tickets', authenticateRequestToken, requireAdminRole, async (request, response) => {
  try {
    const { status, category, page = 1, limit = 20 } = request.query;

    const query = {};
    if (status && SUPPORT_STATUSES.includes(String(status))) {
      query.ticketStatus = String(status);
    }
    if (category && SUPPORT_CATEGORIES.includes(String(category))) {
      query.issueCategory = String(category);
    }

    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(limit, 10) || 20));
    const skip = (pageNumber - 1) * pageSize;

    const [tickets, totalCount] = await Promise.all([
      CustomerSupportTicket.find(query)
        .populate('deliveryPartnerId', 'fullName emailAddress primaryDeliveryCity')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .select('-__v'),
      CustomerSupportTicket.countDocuments(query),
    ]);

    return response.status(200).json({
      success: true,
      page: pageNumber,
      limit: pageSize,
      totalCount,
      tickets,
    });
  } catch (error) {
    return response.status(500).json({
      success: false,
      message: 'Failed to retrieve support tickets.',
      errorDetails: error.message,
    });
  }
});

customerSupportRouter.get('/my-tickets', authenticateRequestToken, async (request, response) => {
  try {
    if (!request.authenticatedUser || request.authenticatedUser.role !== 'partner') {
      return response.status(403).json({
        success: false,
        message: 'Partner role is required for this action.',
      });
    }

    const partnerId = String(request.authenticatedUser.sub || '').trim();
    if (!partnerId || !mongoose.isValidObjectId(partnerId)) {
      return response.status(400).json({
        success: false,
        message: 'Valid partner identity is required.',
      });
    }

    const { status, category, page = 1, limit = 10 } = request.query;

    const query = { deliveryPartnerId: partnerId };
    if (status && SUPPORT_STATUSES.includes(String(status))) {
      query.ticketStatus = String(status);
    }
    if (category && SUPPORT_CATEGORIES.includes(String(category))) {
      query.issueCategory = String(category);
    }

    const pageNumber = Math.max(1, Number.parseInt(page, 10) || 1);
    const pageSize = Math.min(50, Math.max(1, Number.parseInt(limit, 10) || 10));
    const skip = (pageNumber - 1) * pageSize;

    const [tickets, totalCount] = await Promise.all([
      CustomerSupportTicket.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .select('-__v'),
      CustomerSupportTicket.countDocuments(query),
    ]);

    return response.status(200).json({
      success: true,
      page: pageNumber,
      limit: pageSize,
      totalCount,
      tickets,
    });
  } catch (error) {
    return response.status(500).json({
      success: false,
      message: 'Failed to retrieve your support tickets. Please try again later.',
      errorDetails: error.message,
    });
  }
});

module.exports = customerSupportRouter;
