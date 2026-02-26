import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/client.js';
import { verifyApprovalToken, consumeApprovalToken } from '../services/approvalToken.js';
import { appendAudit } from '../services/audit.js';
import { getBudgetLimits, reserveDailySpend, releaseDailySpend } from '../services/budget.js';
import { stripeChargeQueue } from '../queue/index.js';

interface Params { token: string }

export default async function approveDeclineRoutes(app: FastifyInstance) {
  app.post<{ Params: Params }>(
    '/v1/approve/:token',
    async (request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) => {
      const { token } = request.params;
      const payload = verifyApprovalToken(token);
      if (!payload || payload.action !== 'approve') {
        return reply.status(400).send({ error: 'Invalid or expired token' });
      }

      const state = await consumeApprovalToken(payload.jti);
      if (state === 'missing') {
        return reply.status(400).send({ error: 'Invalid or expired token' });
      }
      if (state === 'used') {
        const replayTx = await query<{ agent_id: string }>(`SELECT agent_id FROM transactions WHERE id = $1`, [payload.transactionId]);
        if (replayTx.rows.length > 0) {
          await appendAudit({
            agentId: replayTx.rows[0].agent_id,
            transactionId: payload.transactionId,
            action: 'payment.approval_link.replay_attempt',
            details: { action: 'approve' },
          });
        }
        return reply.status(409).send({ error: 'Link already used' });
      }

      const txResult = await query<{ id: string; agent_id: string; status: string; amount_cents: number }>(
        `SELECT id, agent_id, status, amount_cents FROM transactions WHERE id = $1`,
        [payload.transactionId]
      );
      if (txResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Transaction not found' });
      }
      const tx = txResult.rows[0];
      if (tx.status !== 'pending') {
        return reply.status(400).send({ error: 'Transaction no longer pending' });
      }

      const limits = await getBudgetLimits(tx.agent_id);
      if (!limits) {
        return reply.status(400).send({ error: 'No budget limits configured for agent' });
      }
      const reserved = await reserveDailySpend(tx.agent_id, tx.amount_cents, limits.dailyLimitCents);
      if (!reserved.ok) {
        await appendAudit({
          agentId: tx.agent_id,
          transactionId: payload.transactionId,
          action: 'budget.exceeded',
          details: { amount_cents: tx.amount_cents, reason: 'daily_exceeded', source: 'approval_link' },
        });
        return reply.status(402).send({ error: 'Budget exceeded', reason: 'daily_exceeded' });
      }

      try {
        await query(
          `UPDATE transactions SET status = 'approved' WHERE id = $1`,
          [payload.transactionId]
        );
        await appendAudit({
          agentId: tx.agent_id,
          transactionId: payload.transactionId,
          action: 'payment.approved',
          details: { source: 'approval_link' },
        });

        if (stripeChargeQueue) {
          await stripeChargeQueue.add('charge', { transactionId: payload.transactionId });
        }

        return reply.send({ ok: true, transaction_id: payload.transactionId });
      } catch (error) {
        // Compensate reservation so failed approval processing does not leak daily spend.
        await releaseDailySpend(tx.agent_id, tx.amount_cents).catch(() => undefined);
        throw error;
      }
    }
  );

  app.post<{ Params: Params }>(
    '/v1/decline/:token',
    async (request: FastifyRequest<{ Params: Params }>, reply: FastifyReply) => {
      const { token } = request.params;
      const payload = verifyApprovalToken(token);
      if (!payload || payload.action !== 'decline') {
        return reply.status(400).send({ error: 'Invalid or expired token' });
      }

      const state = await consumeApprovalToken(payload.jti);
      if (state === 'missing') {
        return reply.status(400).send({ error: 'Invalid or expired token' });
      }
      if (state === 'used') {
        const replayTx = await query<{ agent_id: string }>(`SELECT agent_id FROM transactions WHERE id = $1`, [payload.transactionId]);
        if (replayTx.rows.length > 0) {
          await appendAudit({
            agentId: replayTx.rows[0].agent_id,
            transactionId: payload.transactionId,
            action: 'payment.approval_link.replay_attempt',
            details: { action: 'decline' },
          });
        }
        return reply.status(409).send({ error: 'Link already used' });
      }

      const txResult = await query<{ id: string; agent_id: string; status: string; amount_cents: number }>(
        `SELECT id, agent_id, status, amount_cents FROM transactions WHERE id = $1`,
        [payload.transactionId]
      );
      if (txResult.rows.length === 0) {
        return reply.status(404).send({ error: 'Transaction not found' });
      }
      const tx = txResult.rows[0];
      if (tx.status !== 'pending') {
        return reply.status(400).send({ error: 'Transaction no longer pending' });
      }

      await query(
        `UPDATE transactions SET status = 'declined', completed_at = now() WHERE id = $1`,
        [payload.transactionId]
      );
      await appendAudit({
        agentId: tx.agent_id,
        transactionId: payload.transactionId,
        action: 'payment.declined',
        details: { source: 'approval_link' },
      });

      return reply.send({ ok: true, transaction_id: payload.transactionId });
    }
  );
}
