# AgentPay API

Backend for AgentPay: budget enforcement, human approval workflow, Stripe integration, audit trail.

## Setup

1. Copy `.env.example` to `.env` and fill in values.
2. **Neon**: Create a Postgres database at [neon.tech](https://neon.tech), copy connection string to `DATABASE_URL`.
3. **Upstash Redis**: Create database at [upstash.com](https://upstash.com), copy URL to `REDIS_URL`.
4. **Railway**: Create project, add Neon and Upstash as plugins or env vars, connect repo, push to deploy.
5. **Sentry**: Create project at [sentry.io](https://sentry.io), add DSN to `SENTRY_DSN`.

## Commands

- `npm run dev` — development with hot reload
- `npm run build` && `npm start` — production
- `npm run migrate` — run DB migrations
- `npm run seed` — seed test org and agent (prints API key once)
- `npm test` — run tests

## Phase 1.4 E2E check

1. Set `DATABASE_URL` and run `npm run migrate` then `npm run seed`; note the API key.
2. Start the server (`npm run dev` or deploy to Railway).
3. Run: `API_BASE_URL=http://localhost:3000 API_KEY=<key> ./scripts/e2e-curl.sh` (or use Railway URL).
4. Expect HTTP 200 and a stub response; confirm a row in `audit_logs` in Neon.

## Deploy (Railway)

Push to the connected branch; Railway runs `npm run build` then `npm start`. Set all env vars in Railway dashboard.
