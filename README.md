# AgentPay

Middleware between AI agents and Stripe: budget enforcement, human approval for large amounts, and a full audit trail.

## Repo structure

- **backend** — Fastify API (Neon, Upstash Redis, BullMQ, Stripe, Resend). Deploy to Railway.
- **dashboard** — Next.js dashboard (transactions, agents, budget limits). Deploy to Vercel. Magic-link login.
- **sdk-ts** — TypeScript/JavaScript SDK (`@agentpay/sdk`). Publish to npm.
- **sdk-py** — Python SDK (`agentpay`). Publish to PyPI.
- **examples** — Local env + demo script to test the SDK and API with real-world scenarios (small/large payment, idempotency). See [examples/README.md](examples/README.md).

## Quick start

1. **Backend**: `cd backend`, copy `.env.example` to `.env`, set `DATABASE_URL` (Neon), `REDIS_URL` (Upstash), `JWT_SECRET`, and optionally Stripe/Resend/Sentry. Run `npm run migrate`, `npm run seed`, then `npm run dev`.
2. **Dashboard**: `cd dashboard`, set `NEXT_PUBLIC_API_URL` to your backend URL (or leave unset for same-origin rewrites). Run `npm run dev` (port 3001). Set `DASHBOARD_ORIGIN` on the backend to `http://localhost:3001` so magic-link redirects here.
3. **First login**: Ensure the test org has `admin_email` (seed uses `admin@test.org`). Request a login link at `/`, then open the link from email; you’ll be redirected to `/dashboard` with a session. Use the dashboard to view transactions and agents and edit budget limits.
4. **First payment**: Use the API key printed by `npm run seed` and call `POST /v1/payment-request` with `amount_cents`, `idempotency_key`, etc. Or use the TypeScript/Python SDK.
5. **Test SDK / real-world flow**: From `examples`, run `AGENTPAY_API_KEY=<key> npm run demo` (see [examples/README.md](examples/README.md)).

## Phase 4 (go live)

- **Stripe live**: Set `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` to live keys. Configure the webhook URL in Stripe to `https://your-api/v1/stripe/webhook`.
- **Sentry**: Already wired; set `SENTRY_DSN` and enable alerts.
- **Structured logging**: Add request ID and agent ID to log lines in middleware.
- **Self-serve onboarding**: Add a signup flow that creates an org and sets `admin_email`, then sends a magic-link (or reuse `POST /v1/dashboard/login-link` after creating the org via a signup endpoint).

## Verification (does it work?)

Tests pass and the server starts; the full payment flow needs Postgres + Redis. See **[VERIFICATION.md](VERIFICATION.md)** for what was run, what you can run (including Docker E2E), and a short “understand the codebase” order.

## Security

See [backend/SECURITY.md](backend/SECURITY.md) for Stripe webhooks, single-use approval JWTs, rate limiting, and API key handling.
