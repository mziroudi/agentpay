# AgentPay – Local env and SDK demo

This folder lets you run a **real environment** with the backend and an **agent** (the demo script) that uses the SDK to simulate payment requests.

## 1. One-time setup

### Backend env

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and set at least:

- **DATABASE_URL** – Neon Postgres connection string (or any Postgres).
- **REDIS_URL** – Upstash Redis URL (or any Redis).
- **JWT_SECRET** – Any long random string (e.g. `openssl rand -hex 32`).

Optional for full flow:

- **STRIPE_SECRET_KEY** / **STRIPE_WEBHOOK_SECRET** – so auto-approved payments actually charge (test mode).
- **RESEND_API_KEY** – so large payments send a real approval email.

### Database and seed

```bash
cd backend
npm install
npm run migrate
npm run seed
```

**Copy the API key** printed by `npm run seed` (shown only once). You’ll use it as `AGENTPAY_API_KEY`.

### SDK build (for SDK demo)

```bash
cd sdk-ts
npm install
npm run build
cd ../examples
npm install
```

## 2. Run the backend

In one terminal:

```bash
cd backend
npm run dev
```

Leave it running. Default: http://localhost:3000.

## 3. Run the agent demo (SDK)

In another terminal, using the **API key from step 1**:

```bash
cd examples
AGENTPAY_API_KEY=<paste-key-here> npm run demo
```

Or with a custom base URL:

```bash
AGENTPAY_BASE_URL=http://localhost:3000 AGENTPAY_API_KEY=<key> npm run demo
```

This script (using the SDK):

1. Sends a **small payment** ($5) – usually **approved** under the default threshold.
2. Fetches **transaction status** for that payment.
3. Sends a **larger payment** ($50) – may be **pending** until someone clicks Approve in the email (if Resend is configured).
4. Demonstrates **idempotency** by sending the same request twice with the same `idempotency_key`.

## 4. Run the API-only demo (no SDK)

If you haven’t built the SDK or want to test the API only:

```bash
cd examples
AGENTPAY_API_KEY=<key> npm run demo:api
```

This uses `fetch` against `POST /v1/payment-request` and `GET /v1/transactions/:id` with the same scenarios.

## 5. Real-world checks

- **Dashboard**: Set `organizations.admin_email` (e.g. seed uses `admin@test.org`). Request a magic-link at the dashboard login page; use the link to sign in and see transactions/agents.
- **Approval email**: For a payment over the approval threshold, set **RESEND_API_KEY** and **RESEND_FROM_EMAIL** in `backend/.env`. The email will contain Approve/Decline links; use **Approve** and then confirm in the dashboard that the transaction completed (and in Stripe if configured).
- **Stripe**: To see a real charge in Stripe (test mode), set **STRIPE_SECRET_KEY** and ensure the org has a **stripe_customer_id** (or add a flow to create a customer and attach a payment method). The webhook sets the transaction to `completed` when Stripe confirms the payment.

## Quick reference

| Step              | Command / Env |
|-------------------|----------------|
| Backend           | `cd backend && npm run dev` |
| Migrate           | `cd backend && npm run migrate` |
| Seed (get API key)| `cd backend && npm run seed` |
| SDK demo          | `cd examples && AGENTPAY_API_KEY=<key> npm run demo` |
| API-only demo     | `cd examples && AGENTPAY_API_KEY=<key> npm run demo:api` |
