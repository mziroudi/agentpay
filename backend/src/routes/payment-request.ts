import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/client.js';
import { apiKeyAuth } from '../middleware/auth.js';
import { rateLimitByAgent } from '../middleware/rateLimit.js';
import { checkBudget, reserveDailySpend, releaseDailySpend } from '../services/budget.js';
import { appendAudit } from '../services/audit.js';
import { stripeChargeQueue, approvalEmailQueue } from '../queue/index.js';

const paymentRequestSchema = {
  body: {
    type: 'object',
    required: ['amount_cents', 'idempotency_key'],
    properties: {
      amount_cents: { type: 'integer', minimum: 1 },
      currency: { type: 'string', default: 'USD' },
      purpose: { type: 'string' },
      merchant: { type: 'string' },
      idempotency_key: { type: 'string', minLength: 1 },
      context: { type: 'object' },
    },
  },
} as const;

interface TransactionRow {
  id: string;
  status: string;
}

export default async function paymentRequestRoutes(app: FastifyInstance) {
  app.post<{
    Body: {
      amount_cents: number;
      currency?: string;
      purpose?: string;
      merchant?: string;
      idempotency_key: string;
      context?: Record<string, unknown>;
    };
  }>(
    '/v1/payment-request',
    {
      preHandler: [apiKeyAuth, rateLimitByAgent],
      schema: paymentRequestSchema,
    },
    async (request: FastifyRequest<{ Body: { amount_cents: number; currency?: string; purpose?: string; merchant?: string; idempotency_key: string; context?: Record<string, unknown> } }>, reply: FastifyReply) => {
      const agent = request.agent!;
      const { amount_cents, idempotency_key, currency = 'USD', purpose, context } = request.body;

      const existing = await query<TransactionRow>(
        `SELECT id, status FROM transactions WHERE idempotency_key = $1 AND agent_id = $2`,
        [idempotency_key, agent.agentId]
      );
      if (existing.rows.length > 0) {
        const row = existing.rows[0];
        return reply.send({
          status: row.status,
          transaction_id: row.id,
          idempotent: true,
        });
      }

      const budgetResult = await checkBudget(agent.agentId, amount_cents);
      if (!budgetResult.ok) {
        await appendAudit({
          agentId: agent.agentId,
          action: 'budget.exceeded',
          details: { amount_cents, reason: budgetResult.reason },
        });
        return reply.status(402).send({
          error: 'Budget exceeded',
          reason: budgetResult.reason,
        });
      }

      const status = budgetResult.underThreshold ? 'approved' : 'pending';
      let reservedDailySpend = false;
      if (status === 'approved') {
        const reserve = await reserveDailySpend(agent.agentId, amount_cents, budgetResult.dailyLimitCents);
        if (!reserve.ok) {
          await appendAudit({
            agentId: agent.agentId,
            action: 'budget.exceeded',
            details: { amount_cents, reason: 'daily_exceeded' },
          });
          return reply.status(402).send({
            error: 'Budget exceeded',
            reason: 'daily_exceeded',
          });
        }
        reservedDailySpend = true;
      }

      const txId = uuidv4();
      try {
        await query(
          `INSERT INTO transactions (id, agent_id, organization_id, amount_cents, currency, status, purpose, context, idempotency_key)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            txId,
            agent.agentId,
            agent.organizationId,
            amount_cents,
            currency,
            status,
            purpose ?? null,
            context ? JSON.stringify(context) : null,
            idempotency_key,
          ]
        );

        if (status === 'approved') {
          await appendAudit({
            agentId: agent.agentId,
            transactionId: txId,
            action: 'payment.approved',
            details: { amount_cents },
          });
          if (stripeChargeQueue) {
            await stripeChargeQueue.add('charge', { transactionId: txId });
          }
        } else {
          await appendAudit({
            agentId: agent.agentId,
            transactionId: txId,
            action: 'payment.pending',
            details: { amount_cents },
          });
          if (approvalEmailQueue) {
            await approvalEmailQueue.add('send', { transactionId: txId });
          }
        }

        return reply.send({
          status,
          transaction_id: txId,
        });
      } catch (error) {
        if (reservedDailySpend) {
          await releaseDailySpend(agent.agentId, amount_cents).catch(() => undefined);
        }
        throw error;
      }
    }
  );
}
