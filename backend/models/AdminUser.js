/**
 * Mongoose model for administrative users.
 */

'use strict';

const mongoose = require('mongoose');

const adminUserSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, 'fullName is required.'],
      trim: true,
    },
    emailAddress: {
      type: String,
      required: [true, 'emailAddress is required.'],
      trim: true,
      lowercase: true,
      unique: true,
    },
    passwordHash: {
      type: String,
      required: [true, 'passwordHash is required.'],
    },
    createdByAdminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AdminUser',
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const AdminUser = mongoose.model('AdminUser', adminUserSchema);

module.exports = AdminUser;
