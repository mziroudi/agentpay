import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify from 'fastify';
import approveDeclineRoutes from './approve-decline.js';
import { query } from '../db/client.js';
import { releaseDailySpend } from '../services/budget.js';

vi.mock('../db/client.js', () => ({ query: vi.fn() }));
vi.mock('../services/approvalToken.js', () => ({
  verifyApprovalToken: vi.fn().mockReturnValue({
    transactionId: 'tx-123',
    organizationId: 'org-1',
    action: 'approve',
    jti: 'jti-1',
  }),
  consumeApprovalToken: vi.fn().mockResolvedValue('unused'),
}));
vi.mock('../services/budget.js', () => ({
  getBudgetLimits: vi.fn().mockResolvedValue({ dailyLimitCents: 100_000 }),
  reserveDailySpend: vi.fn().mockResolvedValue({ ok: true, newTotal: 2000 }),
  releaseDailySpend: vi.fn().mockResolvedValue(0),
}));
vi.mock('../services/audit.js', () => ({ appendAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../queue/index.js', () => ({ stripeChargeQueue: { add: vi.fn().mockResolvedValue(undefined) } }));

describe('POST /v1/approve/:token', () => {
  const app = Fastify({ logger: false });

  beforeAll(async () => {
    await app.register(approveDeclineRoutes);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('releases reservation if update to approved fails', async () => {
    vi.mocked(query)
      .mockResolvedValueOnce({ rows: [{ id: 'tx-123', agent_id: 'agent-1', status: 'pending', amount_cents: 2000 }], rowCount: 1 } as never)
      .mockRejectedValueOnce(new Error('update failed') as never);

    const res = await app.inject({
      method: 'POST',
      url: '/v1/approve/abc-token',
    });

    expect(res.statusCode).toBe(500);
    expect(vi.mocked(releaseDailySpend)).toHaveBeenCalledWith('agent-1', 2000);
  });
});
