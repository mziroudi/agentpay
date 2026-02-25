import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/client.js';
import { apiKeyAuth } from '../middleware/auth.js';

export default async function transactionRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>(
    '/v1/transactions/:id',
    { preHandler: apiKeyAuth },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const agent = request.agent!;
      const { id } = request.params;

      const result = await query<{ id: string; status: string; amount_cents: number; created_at: Date }>(
        `SELECT id, status, amount_cents, created_at FROM transactions WHERE id = $1 AND agent_id = $2`,
        [id, agent.agentId]
      );
      if (result.rows.length === 0) {
        return reply.status(404).send({ error: 'Transaction not found' });
      }
      const row = result.rows[0];
      return reply.send({
        id: row.id,
        status: row.status,
        amount_cents: row.amount_cents,
        created_at: row.created_at,
      });
    }
  );
}
