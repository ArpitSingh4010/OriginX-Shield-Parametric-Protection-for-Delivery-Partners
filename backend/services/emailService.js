'use strict';

const nodemailer = require('nodemailer');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || '587');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM_EMAIL = process.env.SMTP_FROM_EMAIL || 'no-reply@raksharide.local';
const SMTP_FROM_NAME = process.env.SMTP_FROM_NAME || 'RakshaRide';

let mailTransporter;

function getMailTransporter() {
  if (mailTransporter) {
    return mailTransporter;
  }

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return null;
  }

  mailTransporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  return mailTransporter;
}

async function sendPartnerVerificationEmail({ recipientEmailAddress, recipientFullName, verificationCode }) {
  const transporter = getMailTransporter();

  const subject = 'Your RakshaRide verification code';
  const text = [
    `Hi ${recipientFullName || 'Partner'},`,
    '',
    `Your RakshaRide verification code is: ${verificationCode}`,
    '',
    'This code expires in 10 minutes.',
    '',
    'If you did not request this, you can ignore this email.',
  ].join('\n');

  if (!transporter) {
    console.warn(`[EmailService] SMTP not configured. OTP for ${recipientEmailAddress}: ${verificationCode}`);
    return {
      wasSent: false,
      message: 'SMTP not configured. OTP logged to server console for development.',
    };
  }

  await transporter.sendMail({
    from: `${SMTP_FROM_NAME} <${SMTP_FROM_EMAIL}>`,
    to: recipientEmailAddress,
    subject,
    text,
  });

  return {
    wasSent: true,
    message: 'Verification email sent successfully.',
  };
}

async function sendPartnerPasswordResetEmail({ recipientEmailAddress, recipientFullName, resetCode }) {
  const transporter = getMailTransporter();

  const subject = 'Your RakshaRide password reset code';
  const text = [
    `Hi ${recipientFullName || 'Partner'},`,
    '',
    `Your RakshaRide password reset code is: ${resetCode}`,
    '',
    'This code expires in 10 minutes.',
    '',
    'If you did not request a password reset, you can ignore this email.',
  ].join('\n');

  if (!transporter) {
    console.warn(`[EmailService] SMTP not configured. Password reset OTP for ${recipientEmailAddress}: ${resetCode}`);
    return {
      wasSent: false,
      message: 'SMTP not configured. Password reset OTP logged to server console for development.',
    };
  }

  await transporter.sendMail({
    from: `${SMTP_FROM_NAME} <${SMTP_FROM_EMAIL}>`,
    to: recipientEmailAddress,
    subject,
    text,
  });

  return {
    wasSent: true,
    message: 'Password reset email sent successfully.',
  };
}

module.exports = {
  sendPartnerVerificationEmail,
  sendPartnerPasswordResetEmail,
};
