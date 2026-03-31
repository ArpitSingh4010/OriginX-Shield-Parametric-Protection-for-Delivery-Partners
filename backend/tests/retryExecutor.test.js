const { executeWithRetries } = require('../services/retryExecutor');

describe('retryExecutor', () => {
  it('retries failed operation and eventually returns result', async () => {
    let attempts = 0;
    const value = await executeWithRetries(
      async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new Error('temporary failure');
        }
        return 'ok';
      },
      {
        maxAttempts: 3,
        retryDelayInMilliseconds: 1,
      }
    );

    expect(value).toBe('ok');
    expect(attempts).toBe(3);
  });
});
