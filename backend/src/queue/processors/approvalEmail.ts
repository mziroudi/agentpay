import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import { query } from '../../db/client.js';
import { config } from '../../config.js';
import { createApprovalToken, storeApprovalTokenUnused } from '../../services/approvalToken.js';

interface TxRow {
  id: string;
  organization_id: string;
  amount_cents: number;
  purpose: string | null;
}

interface OrgRow {
  admin_email: string | null;
  name: string;
}

export async function processApprovalEmail(transactionId: string): Promise<void> {
  if (!config.resend.apiKey) {
    throw new Error('RESEND_API_KEY not set');
  }

  const txResult = await query<TxRow>(
    `SELECT id, organization_id, amount_cents, purpose FROM transactions WHERE id = $1 AND status = 'pending'`,
    [transactionId]
  );
  if (txResult.rows.length === 0) return;

  const tx = txResult.rows[0];
  const orgResult = await query<OrgRow>(
    `SELECT admin_email, name FROM organizations WHERE id = $1`,
    [tx.organization_id]
  );
  const org = orgResult.rows[0];
  const toEmail = org?.admin_email ?? process.env.APPROVAL_FALLBACK_EMAIL;
  if (!toEmail) {
    return;
  }

  const approveToken = createApprovalToken(transactionId, tx.organization_id, 'approve');
  const declineToken = createApprovalToken(transactionId, tx.organization_id, 'decline');
  const payloadApprove = jwt.decode(approveToken) as { jti: string } | null;
  const payloadDecline = jwt.decode(declineToken) as { jti: string } | null;
  if (payloadApprove?.jti) await storeApprovalTokenUnused(payloadApprove.jti);
  if (payloadDecline?.jti) await storeApprovalTokenUnused(payloadDecline.jti);

  const baseUrl = config.app.baseUrl.replace(/\/$/, '');
  const approveUrl = `${baseUrl}/v1/approve/${approveToken}`;
  const declineUrl = `${baseUrl}/v1/decline/${declineToken}`;

  const resend = new Resend(config.resend.apiKey);
  await resend.emails.send({
    from: config.resend.fromEmail,
    to: toEmail,
    subject: `AgentPay: Approve payment of $${(tx.amount_cents / 100).toFixed(2)}`,
    html: `
      <p>A payment request requires your approval.</p>
      <p><strong>Amount:</strong> $${(tx.amount_cents / 100).toFixed(2)}</p>
      <p><strong>Purpose:</strong> ${tx.purpose ?? '—'}</p>
      <p><a href="${approveUrl}">Approve</a> | <a href="${declineUrl}">Decline</a></p>
      <p><small>This link expires in 1 hour and can only be used once.</small></p>
    `,
  });
}
