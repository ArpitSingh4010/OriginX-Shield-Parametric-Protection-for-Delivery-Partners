const request = require('supertest');

process.env.ENFORCE_AUTH = 'false';

const expressApplication = require('../server');

describe('Request validation middleware', () => {
  it('returns 400 for invalid registration payload', async () => {
    const response = await request(expressApplication)
      .post('/api/delivery-partners/register')
      .send({
        fullName: '',
        emailAddress: 'not-an-email',
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(Array.isArray(response.body.errors)).toBe(true);
  });

  it('returns 400 for invalid claim id format in path', async () => {
    const response = await request(expressApplication)
      .get('/api/insurance-claims/not-a-mongo-id');

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
  });
});
