# AgentPay API — Security

## Stripe webhook

- **Endpoint**: `POST /v1/stripe/webhook`. Verify `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`.
- **Final status**: Transaction status is set to `completed` or `declined` only from `payment_intent.succeeded` and `payment_intent.payment_failed`. The BullMQ worker sets `processing` only; it does not set final status.

## Approval links (single-use JWT)

- JWT payload: `transaction_id`, `organization_id`, `action`, `jti`, `exp` (1h).
- On creation, `approval_token:{jti}` is stored in Redis as `unused` with TTL.
- On `/v1/approve/:token` and `/v1/decline/:token`, the token is verified and Redis is checked; if not `unused`, return 409 and log replay. If `unused`, mark used then proceed.

## Rate limiting

- Key: `agentpay:rate:{agentId}`. INCR + 60s TTL. If count > 20, return **429 Too Many Requests**. Optionally log in `audit_logs`.

## API keys

- Stored only as SHA-256 hash in `agents.api_key_hash`. Plaintext shown only once on agent creation.

## Audit log

- `audit_logs` is append-only. No secrets in `details`.
