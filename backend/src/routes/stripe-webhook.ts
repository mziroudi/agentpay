import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import Stripe from 'stripe';
import { query } from '../db/client.js';
import { appendAudit } from '../services/audit.js';
import { config } from '../config.js';

interface RequestWithRawBody extends FastifyRequest { rawBody?: string }

export default async function stripeWebhookRoutes(app: FastifyInstance) {
  app.post(
    '/v1/stripe/webhook',
    {
      config: { rawBody: true },
    },
    async (request: RequestWithRawBody, reply: FastifyReply) => {
      const sig = request.headers['stripe-signature'];
      if (!sig || typeof sig !== 'string') {
        return reply.status(400).send({ error: 'Missing Stripe-Signature' });
      }
      if (!config.stripe.webhookSecret) {
        return reply.status(500).send({ error: 'Webhook secret not configured' });
      }

      const rawBody = request.rawBody ?? (typeof request.body === 'string' ? request.body : Buffer.from(JSON.stringify(request.body ?? {})).toString('utf-8'));
      let event: Stripe.Event;
      try {
        const body = typeof rawBody === 'string' ? rawBody : Buffer.from(rawBody).toString('utf-8');
        event = Stripe.webhooks.constructEvent(
          body,
          sig,
          config.stripe.webhookSecret
        ) as Stripe.Event;
      } catch (err) {
        const e = err as Error;
        return reply.status(400).send({ error: `Webhook signature verification failed: ${e.message}` });
      }

      if (event.type === 'payment_intent.succeeded') {
        const pi = event.data.object as Stripe.PaymentIntent;
        const transactionId = pi.metadata?.transaction_id;
        if (!transactionId) {
          return reply.send({ received: true });
        }
        await query(
          `UPDATE transactions SET status = 'completed', completed_at = now() WHERE id = $1 AND status = 'processing'`,
          [transactionId]
        );
        const txRow = await query<{ agent_id: string }>(`SELECT agent_id FROM transactions WHERE id = $1`, [transactionId]);
        if (txRow.rows.length > 0) {
          await appendAudit({
            agentId: txRow.rows[0].agent_id,
            transactionId,
            action: 'payment.completed',
            details: { stripe_payment_intent_id: pi.id },
          });
        }
      } else if (event.type === 'payment_intent.payment_failed') {
        const pi = event.data.object as Stripe.PaymentIntent;
        const transactionId = pi.metadata?.transaction_id;
        if (!transactionId) {
          return reply.send({ received: true });
        }
        await query(
          `UPDATE transactions SET status = 'declined', completed_at = now() WHERE id = $1`,
          [transactionId]
        );
        const txRow = await query<{ agent_id: string }>(`SELECT agent_id FROM transactions WHERE id = $1`, [transactionId]);
        if (txRow.rows.length > 0) {
          await appendAudit({
            agentId: txRow.rows[0].agent_id,
            transactionId,
            action: 'payment.failed',
            details: { stripe_payment_intent_id: pi.id },
          });
        }
      }

      return reply.send({ received: true });
    }
  );
}
