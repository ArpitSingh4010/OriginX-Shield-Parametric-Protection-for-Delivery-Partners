const { logInfo } = require('../utils/logger');

async function triggerPayoutForApprovedClaim({
  claimId,
  deliveryPartnerId,
  payoutAmountInRupees,
}) {
  const payoutMode = process.env.PAYOUT_MODE || 'mock';

  if (payoutMode === 'mock') {
    const mockedTransactionId = `mock_payout_${claimId}_${Date.now()}`;
    logInfo('mock_payout_processed', {
      claimId,
      deliveryPartnerId,
      payoutAmountInRupees,
      mockedTransactionId,
    });
    return {
      payoutTransactionId: mockedTransactionId,
      payoutGatewayName: 'mock_gateway',
    };
  }

  if (payoutMode === 'disabled') {
    throw new Error('Payout processing is currently disabled by configuration.');
  }

  throw new Error(`Unsupported PAYOUT_MODE configuration: ${payoutMode}`);
}

module.exports = {
  triggerPayoutForApprovedClaim,
};
