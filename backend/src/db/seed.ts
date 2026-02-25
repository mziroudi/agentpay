import { randomBytes, createHash } from 'node:crypto';
import { query } from './client.js';
import { v4 as uuidv4 } from 'uuid';

function generateApiKey(): string {
  return randomBytes(32).toString('hex');
}

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey, 'utf-8').digest('hex');
}

async function seed() {
  const existing = await query(
    `SELECT o.id as org_id, a.id as agent_id FROM organizations o
     LEFT JOIN agents a ON a.organization_id = o.id WHERE o.name = $1`,
    ['Test Organization']
  );

  if (existing.rows.length > 0 && (existing.rows[0] as { agent_id: string | null }).agent_id) {
    console.log('Seed already applied (Test Organization + agent exist). Skipping.');
    process.exit(0);
    return;
  }

  const orgId = (existing.rows[0] as { org_id: string } | undefined)?.org_id ?? uuidv4();
  const agentId = uuidv4();
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  if (!(existing.rows[0] as { org_id: string } | undefined)?.org_id) {
    await query(
      `INSERT INTO organizations (id, name, stripe_customer_id, admin_email) VALUES ($1, $2, $3, $4)`,
      [orgId, 'Test Organization', null, 'admin@test.org']
    );
  } else {
    await query(`UPDATE organizations SET admin_email = $1 WHERE id = $2`, ['admin@test.org', orgId]);
  }

  await query(
    `INSERT INTO agents (id, organization_id, name, api_key_hash, is_active)
     VALUES ($1, $2, $3, $4, true)`,
    [agentId, orgId, 'Test Agent', apiKeyHash]
  );

  await query(
    `INSERT INTO budget_limits (agent_id, daily_limit_cents, per_tx_limit_cents, approval_threshold_cents)
     VALUES ($1, 100000, 50000, 10000)
     ON CONFLICT (agent_id) DO NOTHING`,
    [agentId]
  );

  console.log('Seed done.');
  console.log('Organization ID:', orgId);
  console.log('Agent ID:', agentId);
  console.log('API Key (show once, then discard):', apiKey);
  console.log('Use in requests: Authorization: Bearer', apiKey);
}

seed().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
