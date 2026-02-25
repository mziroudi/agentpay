import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/client.js';

export async function appendAudit(params: {
  agentId: string;
  transactionId?: string;
  action: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  await query(
    `INSERT INTO audit_logs (id, agent_id, transaction_id, action, details) VALUES ($1, $2, $3, $4, $5)`,
    [
      uuidv4(),
      params.agentId,
      params.transactionId ?? null,
      params.action,
      params.details ? JSON.stringify(params.details) : null,
    ]
  );
}
