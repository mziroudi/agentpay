-- Idempotency is per-agent: same key can be used by different agents.
-- Drop global UNIQUE on idempotency_key and add UNIQUE(agent_id, idempotency_key).

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_idempotency_key_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_agent_idempotency ON transactions(agent_id, idempotency_key);
