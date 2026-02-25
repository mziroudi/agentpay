# Verification – what was run and what you can run

This doc summarizes what was **actually run** to check the MVP and how **you** can verify it yourself.

---

## What was run in this environment

1. **Backend unit tests**  
   - `cd backend && npm test`  
   - **Result**: All 3 tests passed (401 without key, 401 invalid key, 200 with valid key + mocked DB/Redis).

2. **Backend server start**  
   - `cd backend && node dist/index.js` (no `.env`; uses defaults)  
   - **Result**: Server started and listened on port 3000.

3. **Health endpoint**  
   - `curl http://localhost:3000/health`  
   - **Result**: `200 OK`, `{"status":"ok","timestamp":"..."}`.

4. **Payment endpoint without database**  
   - `curl -X POST .../v1/payment-request` with a fake API key  
   - **Result**: `500` with `{"error":"DATABASE_URL not set"}` — expected, because the auth middleware needs Postgres to look up the API key.

**Conclusion**: The app starts, health works, and the payment route correctly requires a real database. Full payment flow was **not** run here because there is no Postgres/Redis in this environment (Docker wasn’t available).

---

## What you need to run the full flow

The payment flow (auth → budget → transaction → optional Stripe/email) needs:

- **Postgres** (e.g. Neon or local)
- **Redis** (e.g. Upstash or local)

Two ways to get that:

### Option A: Docker (simplest for “does it work?”)

1. Install Docker, then from the repo root:
   ```bash
   docker compose up -d
   ```
2. In `backend`, create `.env` with:
   ```bash
   DATABASE_URL=postgresql://agentpay:agentpay@localhost:5432/agentpay
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=your-secret-at-least-32-characters-long
   ```
3. Then:
   ```bash
   cd backend && npm run migrate && npm run seed && npm run dev
   ```
4. Copy the API key from the seed output and in another terminal:
   ```bash
   cd examples && AGENTPAY_API_KEY=<key> npm run demo:api
   ```
5. Or run the full E2E script (starts Docker, migrate, seed, backend, one payment request):
   ```bash
   ./scripts/run-full-e2e.sh
   ```

### Option B: Neon + Upstash (no Docker)

1. Create a free Postgres DB at [neon.tech](https://neon.tech) and a Redis DB at [upstash.com](https://upstash.com).
2. In `backend/.env` set `DATABASE_URL` and `REDIS_URL` to their connection strings, plus `JWT_SECRET`.
3. Same as above: `npm run migrate`, `npm run seed`, `npm run dev`, then run the demo with the API key.

---

## Quick checklist you can run

| Step | Command | Expected |
|------|---------|----------|
| Tests | `cd backend && npm test` | 3 tests pass |
| Build | `cd backend && npm run build` | No errors |
| Health (no DB) | Start server, `curl http://localhost:3000/health` | `{"status":"ok"}` |
| Full E2E (with Docker) | `./scripts/run-full-e2e.sh` | Script runs migrate, seed, one payment, prints “E2E OK” |
| SDK demo (with DB + API key) | `cd examples && AGENTPAY_API_KEY=<key> npm run demo` | Small payment approved, transaction fetched, idempotency works |

---

## If you want to understand the codebase (≈1 week)

Rough order that matches how the app works:

1. **Entry and config** – `backend/src/index.ts`, `config.ts`  
2. **Auth** – `backend/src/middleware/auth.ts` (API key → hash → DB lookup)  
3. **Payment flow** – `backend/src/routes/payment-request.ts` (idempotency → budget → create transaction → queue jobs)  
4. **Budget** – `backend/src/services/budget.ts` (Redis daily spend + limits)  
5. **Stripe** – `backend/src/queue/processors/stripeCharge.ts`, `backend/src/routes/stripe-webhook.ts`  
6. **Approval** – `backend/src/services/approvalToken.ts`, `backend/src/routes/approve-decline.ts`  
7. **Dashboard** – `backend/src/routes/dashboard-auth.ts`, `dashboard.ts`; Next app in `dashboard/`  

The phased plan in `.cursor/plans/` (or the attached plan) matches this structure phase by phase.
