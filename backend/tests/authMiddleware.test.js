const request = require('supertest');

process.env.JWT_SECRET_KEY = 'test_secret_key';
process.env.ENFORCE_AUTH = 'true';

const expressApplication = require('../server');
const jwt = require('jsonwebtoken');

describe('Authentication enforcement middleware', () => {
  afterAll(() => {
    delete process.env.ENFORCE_AUTH;
  });

  it('rejects protected endpoint call without bearer token', async () => {
    const response = await request(expressApplication)
      .get('/api/insurance-policies/metadata/pricing-model');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });

  it('allows protected endpoint call with valid bearer token', async () => {
    const token = jwt.sign({ sub: 'admin', role: 'admin' }, process.env.JWT_SECRET_KEY, {
      expiresIn: '10m',
    });

    const response = await request(expressApplication)
      .get('/api/insurance-policies/metadata/pricing-model')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });
});
