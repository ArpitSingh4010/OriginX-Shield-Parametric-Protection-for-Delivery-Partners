'use strict';

const mongoose = require('mongoose');

const SUPPORT_CATEGORIES = [
  'general',
  'claims',
  'policy',
  'payment',
  'technical',
  'account',
];

const SUPPORT_STATUSES = [
  'open',
  'in_progress',
  'resolved',
  'closed',
];

const customerSupportTicketSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'Full name is required.'],
      trim: true,
      maxlength: 100,
    },
    emailAddress: {
      type: String,
      required: [true, 'Email address is required.'],
      trim: true,
      lowercase: true,
      maxlength: 120,
    },
    mobilePhoneNumber: {
      type: String,
      default: null,
      trim: true,
      maxlength: 20,
    },
    deliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryPartner',
      default: null,
      index: true,
    },
    issueCategory: {
      type: String,
      enum: SUPPORT_CATEGORIES,
      default: 'general',
      index: true,
    },
    subject: {
      type: String,
      required: [true, 'Subject is required.'],
      trim: true,
      maxlength: 140,
    },
    message: {
      type: String,
      required: [true, 'Message is required.'],
      trim: true,
      maxlength: 2000,
    },
    ticketStatus: {
      type: String,
      enum: SUPPORT_STATUSES,
      default: 'open',
      index: true,
    },
    source: {
      type: String,
      default: 'web',
      trim: true,
      maxlength: 30,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

customerSupportTicketSchema.index({ createdAt: -1 });

const CustomerSupportTicket = mongoose.model('CustomerSupportTicket', customerSupportTicketSchema);

module.exports = {
  CustomerSupportTicket,
  SUPPORT_CATEGORIES,
  SUPPORT_STATUSES,
};
