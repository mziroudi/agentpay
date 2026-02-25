import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes, createHash } from 'node:crypto';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/client.js';
import { getRedis } from '../redis/client.js';
import { requireDashboardSession } from '../middleware/dashboardAuth.js';

export default async function dashboardRoutes(app: FastifyInstance) {
  const preHandler = [requireDashboardSession];

  app.get(
    '/v1/dashboard/transactions',
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = (request as FastifyRequest & { dashboardSession?: { org_id: string } }).dashboardSession!;
      const q = (request as FastifyRequest<{ Querystring: { agent_id?: string; status?: string; limit?: string; offset?: string } }>).query || {};
      const limit = Math.min(parseInt(q.limit || '50', 10), 100);
      const offset = parseInt(q.offset || '0', 10);
      let sql = `SELECT id, agent_id, amount_cents, currency, status, purpose, created_at, completed_at
         FROM transactions WHERE organization_id = $1`;
      const params: (string | number)[] = [session.org_id];
      if (q.agent_id) {
        params.push(q.agent_id);
        sql += ` AND agent_id = $${params.length}`;
      }
      if (q.status) {
        params.push(q.status);
        sql += ` AND status = $${params.length}`;
      }
      params.push(limit, offset);
      sql += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
      const result = await query(sql, params);
      return reply.send({ transactions: result.rows });
    }
  );

  app.get(
    '/v1/dashboard/agents',
    { preHandler },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const session = (request as FastifyRequest & { dashboardSession?: { org_id: string } }).dashboardSession!;
      const result = await query(
        `SELECT a.id, a.name, a.is_active, a.created_at,
                bl.daily_limit_cents, bl.per_tx_limit_cents, bl.approval_threshold_cents
         FROM agents a
         LEFT JOIN budget_limits bl ON bl.agent_id = a.id
         WHERE a.organization_id = $1 ORDER BY a.created_at DESC`,
        [session.org_id]
      );
      return reply.send({ agents: result.rows });
    }
  );

  app.post<{ Body: { name?: string } }>(
    '/v1/dashboard/agents',
    { preHandler },
    async (request: FastifyRequest<{ Body: { name?: string } }>, reply: FastifyReply) => {
      const session = (request as FastifyRequest & { dashboardSession?: { org_id: string } }).dashboardSession!;
      const name = (request.body?.name ?? 'New Agent').toString().trim() || 'New Agent';
      const apiKey = randomBytes(32).toString('hex');
      const apiKeyHash = createHash('sha256').update(apiKey, 'utf-8').digest('hex');
      const agentId = uuidv4();
      await query(
        `INSERT INTO agents (id, organization_id, name, api_key_hash, is_active) VALUES ($1, $2, $3, $4, true)`,
        [agentId, session.org_id, name, apiKeyHash]
      );
      await query(
        `INSERT INTO budget_limits (agent_id, daily_limit_cents, per_tx_limit_cents, approval_threshold_cents)
         VALUES ($1, 100000, 50000, 10000) ON CONFLICT (agent_id) DO NOTHING`,
        [agentId]
      );
      return reply.send({ id: agentId, name, api_key: apiKey });
    }
  );

  app.put<{ Params: { id: string }; Body: { daily_limit_cents?: number; per_tx_limit_cents?: number; approval_threshold_cents?: number } }>(
    '/v1/dashboard/agents/:id/limits',
    { preHandler },
    async (request: FastifyRequest<{ Params: { id: string }; Body: { daily_limit_cents?: number; per_tx_limit_cents?: number; approval_threshold_cents?: number } }>, reply: FastifyReply) => {
      const session = (request as FastifyRequest & { dashboardSession?: { org_id: string } }).dashboardSession!;
      const { id } = request.params;
      const { daily_limit_cents, per_tx_limit_cents, approval_threshold_cents } = request.body || {};
      const owned = await query(`SELECT 1 FROM agents WHERE id = $1 AND organization_id = $2`, [id, session.org_id]);
      if (owned.rows.length === 0) {
        return reply.status(404).send({ error: 'Agent not found' });
      }
      await query(
        `INSERT INTO budget_limits (agent_id, daily_limit_cents, per_tx_limit_cents, approval_threshold_cents)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (agent_id) DO UPDATE SET
           daily_limit_cents = COALESCE(EXCLUDED.daily_limit_cents, budget_limits.daily_limit_cents),
           per_tx_limit_cents = COALESCE(EXCLUDED.per_tx_limit_cents, budget_limits.per_tx_limit_cents),
           approval_threshold_cents = COALESCE(EXCLUDED.approval_threshold_cents, budget_limits.approval_threshold_cents)`,
        [
          id,
          daily_limit_cents ?? 100000,
          per_tx_limit_cents ?? 50000,
          approval_threshold_cents ?? 10000,
        ]
      );
      return reply.send({ ok: true });
    }
  );
}
