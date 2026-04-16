'use strict';

const crypto = require('crypto');

const clientRegistryByPartnerId = new Map();

function ensurePartnerBucket(partnerId) {
  if (!clientRegistryByPartnerId.has(partnerId)) {
    clientRegistryByPartnerId.set(partnerId, new Map());
  }
  return clientRegistryByPartnerId.get(partnerId);
}

function publishSsePayload(response, eventName, payload) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function registerPartnerAlertStream(partnerId, response) {
  const clientId = crypto.randomUUID();
  const bucket = ensurePartnerBucket(partnerId);

  response.setHeader('Content-Type', 'text/event-stream');
  response.setHeader('Cache-Control', 'no-cache, no-transform');
  response.setHeader('Connection', 'keep-alive');
  response.flushHeaders?.();

  bucket.set(clientId, response);

  publishSsePayload(response, 'connected', {
    partnerId,
    clientId,
    connectedAt: new Date().toISOString(),
  });

  const heartbeatInterval = setInterval(() => {
    publishSsePayload(response, 'heartbeat', { timestamp: new Date().toISOString() });
  }, 20000);

  const unregisterClient = () => {
    clearInterval(heartbeatInterval);
    const existingBucket = clientRegistryByPartnerId.get(partnerId);
    if (!existingBucket) {
      return;
    }

    existingBucket.delete(clientId);
    if (existingBucket.size === 0) {
      clientRegistryByPartnerId.delete(partnerId);
    }
  };

  response.on('close', unregisterClient);

  return { clientId, unregisterClient };
}

function publishPartnerAlert(partnerId, alertPayload) {
  const bucket = clientRegistryByPartnerId.get(String(partnerId));
  if (!bucket || bucket.size === 0) {
    return 0;
  }

  const payload = {
    ...alertPayload,
    timestamp: alertPayload?.timestamp || new Date().toISOString(),
  };

  let deliveredCount = 0;
  for (const response of bucket.values()) {
    publishSsePayload(response, 'claim-alert', payload);
    deliveredCount += 1;
  }

  return deliveredCount;
}

module.exports = {
  registerPartnerAlertStream,
  publishPartnerAlert,
};
