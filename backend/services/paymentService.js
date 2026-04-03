/**
 * Payment service â€” Razorpay integration.
 *
 * Handles two separate payment flows:
 *   1. Premium collection  â€” worker pays weekly premium via Razorpay Order + Checkout.
 *   2. Claim payout        â€” GigShield transfers compensation to worker's bank account
 *                            via Razorpay Payouts API.
 *
 * STUB MODE
 * ---------
 * When RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set the service
 * automatically runs in stub mode.  All functions return realistic-looking
 * mock data so the rest of the system can be developed and tested without
 * live Razorpay credentials.  Stub responses are clearly marked with
 * `isStub: true` so callers can distinguish them from live responses.
 */

'use strict';

const https = require('https');
const crypto = require('crypto');

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_ACCOUNT_NUMBER = process.env.RAZORPAY_ACCOUNT_NUMBER || '';

const IS_PAYMENT_STUB_MODE = !RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET;

if (IS_PAYMENT_STUB_MODE) {
  console.warn(
    '[PaymentService] Running in STUB mode â€” set RAZORPAY_KEY_ID and ' +
      'RAZORPAY_KEY_SECRET in .env to enable live payments.'
  );
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Generates a stub transaction identifier for use during development.
 *
 * @param {string} prefix - Short prefix indicating the transaction type.
 * @returns {string} A mock transaction ID.
 */
function generateStubTransactionId(prefix) {
  const randomSuffix = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `${prefix}_STUB_${Date.now()}_${randomSuffix}`;
}

/**
 * Makes an authenticated HTTPS request to the Razorpay REST API.
 *
 * @param {string} method  - HTTP method ('GET', 'POST', etc.).
 * @param {string} apiPath - Razorpay API path (e.g. '/v1/orders').
 * @param {object} [body]  - Request body; omit for GET requests.
 * @returns {Promise<object>} Parsed JSON response from Razorpay.
 */
function makeRazorpayApiRequest(method, apiPath, body) {
  return new Promise((resolve, reject) => {
    const authorizationToken = Buffer.from(
      `${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`
    ).toString('base64');

    const serialisedBody = body ? JSON.stringify(body) : '';

    const requestOptions = {
      hostname: 'api.razorpay.com',
      path: apiPath,
      method,
      headers: {
        Authorization: `Basic ${authorizationToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(serialisedBody),
      },
    };

    const httpRequest = https.request(requestOptions, (httpResponse) => {
      let rawResponseBody = '';
      httpResponse.on('data', (chunk) => { rawResponseBody += chunk; });
      httpResponse.on('end', () => {
        try {
          const parsedResponse = JSON.parse(rawResponseBody);
          if (httpResponse.statusCode >= 200 && httpResponse.statusCode < 300) {
            resolve(parsedResponse);
          } else {
            const razorpayErrorMessage =
              parsedResponse.error?.description || rawResponseBody;
            reject(
              new Error(
                `Razorpay API error (HTTP ${httpResponse.statusCode}): ${razorpayErrorMessage}`
              )
            );
          }
        } catch (jsonParseError) {
          reject(
            new Error(
              `Failed to parse Razorpay response: ${jsonParseError.message}`
            )
          );
        }
      });
    });

    httpRequest.on('error', (networkError) => {
      reject(
        new Error(`Razorpay network request failed: ${networkError.message}`)
      );
    });

    if (serialisedBody) {
      httpRequest.write(serialisedBody);
    }

    httpRequest.end();
  });
}

// â”€â”€â”€ Premium Collection (Worker â†’ GigShield) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Creates a Razorpay Order for collecting the weekly insurance premium.
 *
 * The returned `orderId` must be passed to the frontend Razorpay Checkout
 * widget.  After the worker completes payment, call `verifyPremiumPayment`
 * with the callback data to confirm the transaction.
 *
 * @param {number} amountInRupees - Weekly premium amount in INR (whole rupees).
 * @param {string} policyId       - MongoDB policy document ID used as the receipt reference.
 * @returns {Promise<{
 *   orderId: string,
 *   amount: number,
 *   currency: string,
 *   receipt: string,
 *   isStub: boolean
 * }>}
 */
async function createPremiumPaymentOrder(amountInRupees, policyId) {
  if (IS_PAYMENT_STUB_MODE) {
    return {
      orderId: generateStubTransactionId('order'),
      amount: amountInRupees * 100,
      currency: 'INR',
      receipt: `policy_${policyId}`,
      isStub: true,
    };
  }

  const razorpayOrder = await makeRazorpayApiRequest('POST', '/v1/orders', {
    amount: amountInRupees * 100, // Razorpay expects paise
    currency: 'INR',
    receipt: `policy_${policyId}`,
    notes: { policyId },
  });

  return {
    orderId: razorpayOrder.id,
    amount: razorpayOrder.amount,
    currency: razorpayOrder.currency,
    receipt: razorpayOrder.receipt,
    isStub: false,
  };
}

/**
 * Verifies the Razorpay payment signature received from the frontend
 * after the worker completes checkout.
 *
 * Razorpay generates a signature = HMAC-SHA256(orderId + "|" + paymentId)
 * using the API secret.  This function recomputes and compares it.
 *
 * In stub mode the function always returns `isVerified: true` with the
 * provided (or a generated) payment ID.
 *
 * @param {string} razorpayOrderId    - Order ID returned from createPremiumPaymentOrder.
 * @param {string} razorpayPaymentId  - Payment ID from Razorpay checkout callback.
 * @param {string} razorpaySignature  - Signature from Razorpay checkout callback.
 * @returns {{ isVerified: boolean, paymentId: string, isStub: boolean }}
 */
function verifyPremiumPayment(
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature
) {
  if (IS_PAYMENT_STUB_MODE) {
    return {
      isVerified: true,
      paymentId: razorpayPaymentId || generateStubTransactionId('pay'),
      isStub: true,
    };
  }

  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');

  const isVerified = expectedSignature === razorpaySignature;

  return { isVerified, paymentId: razorpayPaymentId, isStub: false };
}

// â”€â”€â”€ Claim Payout (GigShield â†’ Worker) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Initiates a bank transfer payout to the delivery partner using the
 * Razorpay Payouts API.
 *
 * Flow:
 *   1. Create a Contact (represents the beneficiary).
 *   2. Create a Fund Account linked to that Contact.
 *   3. Create a Payout from the GigShield settlement account to the Fund Account.
 *
 * Requires RAZORPAY_ACCOUNT_NUMBER to be set (the GigShield current account
 * registered with Razorpay).  Without it the function falls back to stub mode.
 *
 * @param {number} amountInRupees    - Compensation amount in INR.
 * @param {string} claimId           - MongoDB claim document ID (for reference).
 * @param {object} [beneficiaryDetails] - Bank details of the worker.
 * @param {string} [beneficiaryDetails.accountHolderName]
 * @param {string} [beneficiaryDetails.accountNumber]
 * @param {string} [beneficiaryDetails.ifscCode]
 * @returns {Promise<{
 *   payoutId: string,
 *   status: string,
 *   amountInRupees: number,
 *   claimId: string,
 *   isStub: boolean
 * }>}
 */
async function initiateClaimPayout(amountInRupees, claimId, beneficiaryDetails = {}) {
  if (IS_PAYMENT_STUB_MODE || !RAZORPAY_ACCOUNT_NUMBER) {
    console.warn(
      '[PaymentService] Payout for claim ' + claimId + ' running in STUB mode.'
    );
    return {
      payoutId: generateStubTransactionId('pout'),
      status: 'processed',
      amountInRupees,
      claimId,
      isStub: true,
    };
  }

  // Step 1 â€” Create a Razorpay Contact for the worker.
  const razorpayContact = await makeRazorpayApiRequest('POST', '/v1/contacts', {
    name: beneficiaryDetails.accountHolderName || 'GigShield Worker',
    type: 'employee',
    reference_id: `worker_${claimId}`,
  });

  // Step 2 â€” Link their bank account as a Fund Account.
  const razorpayFundAccount = await makeRazorpayApiRequest(
    'POST',
    '/v1/fund_accounts',
    {
      contact_id: razorpayContact.id,
      account_type: 'bank_account',
      bank_account: {
        name: beneficiaryDetails.accountHolderName || 'GigShield Worker',
        ifsc: beneficiaryDetails.ifscCode,
        account_number: beneficiaryDetails.accountNumber,
      },
    }
  );

  // Step 3 â€” Create the payout.
  const razorpayPayout = await makeRazorpayApiRequest('POST', '/v1/payouts', {
    account_number: RAZORPAY_ACCOUNT_NUMBER,
    fund_account_id: razorpayFundAccount.id,
    amount: amountInRupees * 100, // paise
    currency: 'INR',
    mode: 'IMPS',
    purpose: 'payout',
    queue_if_low_balance: true,
    reference_id: claimId,
    narration: `GigShield claim payout ${claimId}`,
  });

  return {
    payoutId: razorpayPayout.id,
    status: razorpayPayout.status,
    amountInRupees,
    claimId,
    isStub: false,
  };
}

// â”€â”€â”€ Exports â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

module.exports = {
  createPremiumPaymentOrder,
  verifyPremiumPayment,
  initiateClaimPayout,
  IS_PAYMENT_STUB_MODE,
};


