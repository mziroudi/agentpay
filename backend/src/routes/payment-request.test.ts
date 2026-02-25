import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import paymentRequestRoutes from './payment-request.js';
import { query } from '../db/client.js';

vi.mock('../db/client.js', () => ({ query: vi.fn() }));
vi.mock('../services/budget.js', () => ({
  checkBudget: vi.fn().mockResolvedValue({ ok: true, underThreshold: true }),
  addDailySpend: vi.fn().mockResolvedValue(1000),
}));
vi.mock('../services/audit.js', () => ({
  appendAudit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../queue/index.js', () => ({
  stripeChargeQueue: { add: vi.fn().mockResolvedValue(undefined) },
}));

describe('POST /v1/payment-request', () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    await app.register(cors, { origin: true });
    await app.register(paymentRequestRoutes);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 401 without Authorization', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 } as never);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/payment-request',
      payload: { amount_cents: 1000, idempotency_key: 'test-key-1' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 for invalid API key', async () => {
    vi.mocked(query).mockResolvedValue({ rows: [], rowCount: 0 } as never);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/payment-request',
      headers: { authorization: 'Bearer invalid-key' },
      payload: { amount_cents: 1000, idempotency_key: 'test-key-2' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns approved and writes transaction when under budget', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'agent-uuid', organization_id: 'org-uuid' }], rowCount: 1 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as never);
    const res = await app.inject({
      method: 'POST',
      url: '/v1/payment-request',
      headers: { authorization: 'Bearer valid-test-key' },
      payload: {
        amount_cents: 1000,
        idempotency_key: 'test-key-3',
        purpose: 'Test payment',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('approved');
    expect(body.transaction_id).toBeDefined();
  });
});
