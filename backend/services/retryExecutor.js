function waitForMilliseconds(millisecondsToWait) {
  return new Promise((resolve) => {
    setTimeout(resolve, millisecondsToWait);
  });
}

async function executeWithRetries(asyncOperation, options = {}) {
  const {
    maxAttempts = 3,
    retryDelayInMilliseconds = 250,
  } = options;

  let lastThrownError = null;

  for (let attemptNumber = 1; attemptNumber <= maxAttempts; attemptNumber += 1) {
    try {
      return await asyncOperation();
    } catch (operationError) {
      lastThrownError = operationError;
      if (attemptNumber < maxAttempts) {
        await waitForMilliseconds(retryDelayInMilliseconds);
      }
    }
  }

  throw lastThrownError;
}

module.exports = {
  executeWithRetries,
};
