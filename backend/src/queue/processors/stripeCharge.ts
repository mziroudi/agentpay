import Stripe from 'stripe';
import { query } from '../../db/client.js';
import { appendAudit } from '../../services/audit.js';
import { config } from '../../config.js';

interface TxRow {
  id: string;
  agent_id: string;
  organization_id: string;
  amount_cents: number;
  currency: string;
}

interface OrgRow {
  stripe_customer_id: string | null;
}

export async function processStripeCharge(transactionId: string): Promise<void> {
  if (!config.stripe.secretKey) {
    throw new Error('STRIPE_SECRET_KEY not set');
  }
  const stripe = new Stripe(config.stripe.secretKey, { apiVersion: '2023-10-16' });

  const txResult = await query<TxRow>(
    `SELECT id, agent_id, organization_id, amount_cents, currency FROM transactions WHERE id = $1 AND status = 'approved'`,
    [transactionId]
  );
  if (txResult.rows.length === 0) return;

  const tx = txResult.rows[0];
  const orgResult = await query<OrgRow>(
    `SELECT stripe_customer_id FROM organizations WHERE id = $1`,
    [tx.organization_id]
  );
  const stripeCustomerId = orgResult.rows[0]?.stripe_customer_id ?? null;
  if (!stripeCustomerId) {
    await query(
      `UPDATE transactions SET status = 'declined' WHERE id = $1`,
      [transactionId]
    );
    await appendAudit({
      agentId: tx.agent_id,
      transactionId,
      action: 'payment.failed',
      details: { reason: 'no_stripe_customer' },
    });
    return;
  }

  const paymentIntent = await stripe.paymentIntents.create({
    amount: tx.amount_cents,
    currency: (tx.currency || 'usd').toLowerCase(),
    customer: stripeCustomerId,
    automatic_payment_methods: { enabled: true },
    metadata: { transaction_id: transactionId },
  });

  await query(
    `UPDATE transactions SET stripe_charge_id = $1, status = 'processing' WHERE id = $2`,
    [paymentIntent.id, transactionId]
  );
}
