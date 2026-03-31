const LOG_LEVELS = {
  INFO: 'info',
  ERROR: 'error',
};

function formatLogEntry(level, message, metadata = {}) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata,
  });
}

function logInfo(message, metadata) {
  console.log(formatLogEntry(LOG_LEVELS.INFO, message, metadata));
}

function logError(message, metadata) {
  console.error(formatLogEntry(LOG_LEVELS.ERROR, message, metadata));
}

const requestLoggerStream = {
  write(message) {
    logInfo('http_request', { message: message.trim() });
  },
};

module.exports = {
  logInfo,
  logError,
  requestLoggerStream,
};
