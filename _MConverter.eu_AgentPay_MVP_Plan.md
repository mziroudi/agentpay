**AgentPay**

**MVP Build Plan**

*Solo developer · 4 weeks · Real product at the end*

|                                                                                                                                                                                                                                                                                     |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| 💡 AgentPay is a middleware layer that sits between AI agents and Stripe. When an agent wants to spend money, AgentPay checks its budget, auto-approves small amounts, routes big amounts to a human for approval, charges Stripe, and logs everything. That is the entire product. |

**1. What You Are Building**

Before writing a line of code it is worth being precise about the three things AgentPay does. Everything else --- dashboards, Slack integrations, merchant whitelists, multi-currency --- comes after you have paying customers.

**The Three Core Jobs**

|        |                             |                                                                                                                                                                                                                        |
|--------|-----------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **\#** | **Job**                     | **What it means in practice**                                                                                                                                                                                          |
| **1**  | **Budget enforcement**      | Every payment request from an agent is checked against a daily limit and a per-transaction limit. If it is over either, it is blocked or queued. If it is under, it is approved. This check must happen in under 30ms. |
| **2**  | **Human approval workflow** | When a transaction is over the auto-approve threshold, a human gets an email with an Approve or Decline link. One click. No login required. The agent waits (via polling) or gets a webhook when the decision is made. |
| **3**  | **Audit trail**             | Every decision --- approved, declined, queued, timed out --- is written to a log with the agent identity, the amount, the stated purpose, and a timestamp. This is what enterprises pay for.                           |

**The Request Flow**

This is the sequence every single payment request follows. Understand this flow and the build plan makes complete sense.

|       |                                                                                              |
|-------|----------------------------------------------------------------------------------------------|
| **1** | Agent calls pay.request({ amount, purpose, merchant }) via the SDK.                          |
| **2** | SDK signs the request with HMAC-SHA256 and sends it to the API.                              |
| **3** | API validates the API key and looks up the agent identity.                                   |
| **4** | Budget engine checks Redis: has this agent exceeded its daily or per-transaction limit?      |
| **5** | If under threshold → job queued to charge Stripe → immediate \'approved\' response to agent. |
| **6** | If over threshold → transaction saved as \'pending\' → approval email sent to org admin.     |
| **7** | Admin clicks Approve or Decline in email → Stripe charged or transaction declined.           |
| **8** | Everything is written to the audit log regardless of outcome.                                |

**2. Tech Stack**

Every tool below was chosen for one reason: a solo developer can set it up in under an hour, it handles real production load without configuration work, and it gets out of the way.

|                                                                                                                                                              |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ⚠️ No Supabase. No AWS. No Docker Compose with five services. No managed Kubernetes. Those are all fine tools for teams. You are one person with four weeks. |

|                    |                          |                                                                                                                                                                                                          |
|--------------------|--------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| **Concern**        | **Tool**                 | **Why --- not the alternative**                                                                                                                                                                          |
| **Runtime**        | **Node.js 20 + Fastify** | Fastify is 3x faster than Express and has built-in schema validation. You get typed request/response for free. Small memory footprint means cheap hosting.                                               |
| **Database**       | **Neon (Postgres)**      | Serverless Postgres. Built-in connection pooler (no PgBouncer setup). Scales to zero when idle, scales up automatically. Free tier is generous. One connection string, done.                             |
| **Cache**          | **Upstash Redis**        | Serverless Redis. Free up to 10,000 requests per day. You need this for budget checks --- a single Redis INCRBY is the fastest possible way to track daily spend. Pay per request, no cluster to manage. |
| **Job queue**      | **BullMQ**               | Runs on top of the same Upstash Redis you already have. No extra service. Handles Stripe charges and email sending as async jobs with built-in retry. Dead-letter queue included.                        |
| **Deploy**         | **Railway**              | Git push and it is live in two minutes. Automatic SSL. Environment variables in the UI. \$5 per month for a hobby plan. You will never SSH into a server.                                                |
| **Email**          | **Resend**               | Developer-first transactional email. Free for 3,000 emails per month. Clean API. Approval emails with signed links are three lines of code.                                                              |
| **Dashboard**      | **Next.js on Vercel**    | Free hosting. Deploys from GitHub automatically. Your dashboard is a static build with a few API calls. Zero server cost.                                                                                |
| **Error tracking** | **Sentry**               | Free tier. One line to set up. You will know about every crash before your customer does. Non-negotiable.                                                                                                |
| **Payments**       | **Stripe**               | The entire point of the product. Use test mode for weeks 1 through 3. Go live in week 4.                                                                                                                 |

**3. Database Schema**

Five tables. This is the entire data model. Do not add tables during the build unless something is genuinely missing.

**organizations**

One row per company using AgentPay. Ties to a Stripe customer ID.

|                        |                |                                |
|------------------------|----------------|--------------------------------|
| **Column**             | **Type**       | **Notes**                      |
| **id**                 | *UUID*         | Primary key                    |
| **name**               | *VARCHAR(255)* | Company name                   |
| **stripe_customer_id** | *VARCHAR*      | Stripe customer, set on signup |
| **created_at**         | *TIMESTAMPTZ*  |                                |

**agents**

One row per AI agent. An org can have many agents --- a coding agent, a research agent, etc.

|                     |                |                                                     |
|---------------------|----------------|-----------------------------------------------------|
| **Column**          | **Type**       | **Notes**                                           |
| **id**              | *UUID*         | Primary key                                         |
| **organization_id** | *UUID*         | FK → organizations                                  |
| **name**            | *VARCHAR(255)* | Human-readable label                                |
| **api_key_hash**    | *VARCHAR*      | SHA-256 hash of the API key. Never store plaintext. |
| **is_active**       | *BOOLEAN*      | Soft disable without deleting                       |
| **created_at**      | *TIMESTAMPTZ*  |                                                     |

**budget_limits**

Limits per agent. An agent can have a daily limit, a per-transaction limit, and an approval threshold.

|                              |           |                                      |
|------------------------------|-----------|--------------------------------------|
| **Column**                   | **Type**  | **Notes**                            |
| **id**                       | *UUID*    | Primary key                          |
| **agent_id**                 | *UUID*    | FK → agents                          |
| **daily_limit_cents**        | *INTEGER* | Maximum spend per calendar day       |
| **per_tx_limit_cents**       | *INTEGER* | Maximum single transaction           |
| **approval_threshold_cents** | *INTEGER* | Auto-approve below this, queue above |

**transactions**

Every payment request, regardless of outcome. This is the audit trail.

|                      |                  |                                                                               |
|----------------------|------------------|-------------------------------------------------------------------------------|
| **Column**           | **Type**         | **Notes**                                                                     |
| **id**               | *UUID*           | Primary key                                                                   |
| **agent_id**         | *UUID*           | FK → agents                                                                   |
| **organization_id**  | *UUID*           | FK → organizations (denormalised for fast queries)                            |
| **amount_cents**     | *INTEGER*        | Amount in cents                                                               |
| **currency**         | *VARCHAR(3)*     | Default USD                                                                   |
| **status**           | *VARCHAR*        | \'pending\' \| \'approved\' \| \'declined\' \| \'completed\' \| \'timed_out\' |
| **purpose**          | *TEXT*           | Agent\'s stated reason for the payment                                        |
| **context**          | *JSONB*          | Agent metadata --- reasoning, request ID, expected usage                      |
| **stripe_charge_id** | *VARCHAR*        | Set once Stripe charge completes                                              |
| **idempotency_key**  | *VARCHAR UNIQUE* | Prevents double-charges on retries                                            |
| **created_at**       | *TIMESTAMPTZ*    |                                                                               |
| **completed_at**     | *TIMESTAMPTZ*    | Set when status reaches a terminal state                                      |

**audit_logs**

Append-only log of every action in the system. Never updated, never deleted.

|                    |                |                                                                      |
|--------------------|----------------|----------------------------------------------------------------------|
| **Column**         | **Type**       | **Notes**                                                            |
| **id**             | *UUID*         | Primary key                                                          |
| **agent_id**       | *UUID*         | Which agent triggered this                                           |
| **transaction_id** | *UUID*         | Related transaction if applicable                                    |
| **action**         | *VARCHAR(100)* | e.g. \'payment.approved\', \'payment.declined\', \'budget.exceeded\' |
| **details**        | *JSONB*        | Full context for forensic analysis                                   |
| **created_at**     | *TIMESTAMPTZ*  |                                                                      |

**4. API Endpoints**

Eight endpoints. Everything the SDK needs and everything the dashboard needs. Nothing else gets built during the four weeks.

|            |                                     |                                                                                                                                      |
|------------|-------------------------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| **Method** | **Path**                            | **What it does**                                                                                                                     |
| **POST**   | **/v1/payment-request**             | Core endpoint. Agent submits a payment request. Budget check runs synchronously. Returns approved, pending, or declined with reason. |
| **GET**    | **/v1/transactions/:id**            | Agent polls this to check status of a pending transaction while waiting for human approval.                                          |
| **POST**   | **/v1/approve/:token**              | Human clicks Approve in email. Token is a signed JWT. Triggers Stripe charge via BullMQ job.                                         |
| **POST**   | **/v1/decline/:token**              | Human clicks Decline in email. Updates transaction status to declined. Logs reason.                                                  |
| **GET**    | **/v1/dashboard/transactions**      | Dashboard: paginated transaction list with filters for agent, status, date range.                                                    |
| **GET**    | **/v1/dashboard/agents**            | Dashboard: list of agents for this org with their budget config and today\'s spend.                                                  |
| **POST**   | **/v1/dashboard/agents**            | Dashboard: create a new agent and return the API key (only time it is shown in plaintext).                                           |
| **PUT**    | **/v1/dashboard/agents/:id/limits** | Dashboard: update budget limits for an agent.                                                                                        |

**5. The 4-Week Build Plan**

The order matters. Each week builds on the last. Week 1 is infrastructure so week 2 can be pure product logic. Week 3 is interfaces. Week 4 is finding a customer, not building features.

|                                                                                                                               |
|-------------------------------------------------------------------------------------------------------------------------------|
| 📌 One rule for the entire sprint: if a task is not in this plan, it does not get built. Write it down, ship it in month two. |

<table>
<colgroup>
<col style="width: 15%" />
<col style="width: 84%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>W1</strong></td>
<td><p><strong>Foundation</strong></p>
<p><em>Get the plumbing working. No business logic yet.</em></p></td>
</tr>
</tbody>
</table>

This week is entirely setup. By Friday you should be able to make an authenticated API call, have it hit your server on Railway, and see a record appear in Neon. That is the only goal.

|         |                                                                                                                                                                          |               |          |
|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|----------|
| **Day** | **Task**                                                                                                                                                                 | **Output**    | **Tag**  |
| **1**   | Create Railway project. Set up Neon database. Set up Upstash Redis. Wire environment variables. Set up Sentry. Push hello-world Fastify app that deploys on git push.    | Deployed API  | **CORE** |
| **2**   | Write and run DB migrations: create all five tables. Write Flyway migration files. Seed one test org and one test agent.                                                 | Schema live   | **CORE** |
| **3**   | Implement API key generation (random 32-byte hex, store SHA-256 hash in DB). Write auth middleware: extract key from Authorization header, hash it, look up agent in DB. | Auth working  | **CORE** |
| **4**   | Stub POST /v1/payment-request: validate request body with Fastify schema, run auth middleware, return a hardcoded mock response. Write the first real test.              | Endpoint stub | **CORE** |
| **5**   | Full integration test: make a curl request with a real API key → hits Railway → auth passes → stub response → record in audit log. Fix anything broken.                  | E2E green     | **CORE** |

|                                                                                                                                  |
|----------------------------------------------------------------------------------------------------------------------------------|
| ✅ Week 1 done when: a curl request with an API key hits the live Railway URL, passes auth, and you see it in the Neon database. |

<table>
<colgroup>
<col style="width: 15%" />
<col style="width: 84%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>W2</strong></td>
<td><p><strong>The Product</strong></p>
<p><em>Build the three core jobs. This week is the entire value of AgentPay.</em></p></td>
</tr>
</tbody>
</table>

This is the most important week. Everything you ship this week is the actual product. Budget check, Stripe charge, approval email. Get these right and you have something worth selling.

|         |                                                                                                                                                                                                                                                                                           |              |           |
|---------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|--------------|-----------|
| **Day** | **Task**                                                                                                                                                                                                                                                                                  | **Output**   | **Tag**   |
| **6**   | Budget engine: read budget_limits from DB, cache config in Redis (10s TTL). Implement Redis INCRBY for daily spend tracking --- key is agent:{id}:spend:{YYYY-MM-DD} with TTL to midnight. Return approved or budget_exceeded.                                                            | Budget check | **CORE**  |
| **7**   | Idempotency: require idempotency_key on every request, store in transactions table with UNIQUE constraint. If same key is submitted twice, return the existing transaction. This prevents double-charges forever.                                                                         | Idempotency  | **CORE**  |
| **8**   | Auto-approve path: when budget check passes, save transaction as \'approved\', push a BullMQ job to charge Stripe (Payment Intents API, test mode). Worker picks it up, charges Stripe, updates stripe_charge_id, sets status to \'completed\'.                                           | Stripe wired | **BUILD** |
| **9**   | Approval queue path: when amount is over approval_threshold_cents, save transaction as \'pending\', push BullMQ email job. Worker sends Resend email to org admin with two links --- /v1/approve/:token and /v1/decline/:token. Token is a JWT signed with a secret, expires in 24 hours. | Email works  | **BUILD** |
| **10**  | Approve and decline endpoints: validate JWT token, update transaction status, log the decision. Approve path triggers the Stripe charge job. Add circuit breaker: if an agent fires more than 20 requests in 60 seconds, auto-block and email the org admin.                              | Full flow    | **BUILD** |

|                                                                                                                                                                                            |
|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ✅ Week 2 done when: a test agent submits a small amount (auto-approved, Stripe test charge fires) and a large amount (email lands in inbox, clicking Approve triggers the Stripe charge). |

<table>
<colgroup>
<col style="width: 15%" />
<col style="width: 84%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>W3</strong></td>
<td><p><strong>Interfaces</strong></p>
<p><em>SDK and dashboard. Make it usable by a developer and visible to an admin.</em></p></td>
</tr>
</tbody>
</table>

The API works but nobody can use it without a SDK and nobody can see what is happening without a dashboard. Both of these need to exist before you can show a design partner.

|         |                                                                                                                                                                                                                                            |               |           |
|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|---------------|-----------|
| **Day** | **Task**                                                                                                                                                                                                                                   | **Output**    | **Tag**   |
| **11**  | TypeScript SDK: npm package @agentpay/sdk. AgentPay class with pay.request(). Typed error classes: BudgetExceededError, ApprovalTimeoutError, PaymentDeclinedError, RateLimitError. Exponential backoff on 5xx. Never retry on 4xx.        | TS SDK        | **BUILD** |
| **12**  | TypeScript SDK continued: auto-generate idempotency key from SHA-256(amount + merchant + context) if not provided. waitForApproval() method that polls /v1/transactions/:id every 5 seconds until terminal status. Publish to npm as beta. | SDK published | **BUILD** |
| **13**  | Python SDK: pip install agentpay. Mirror of the TS SDK. Same pay.request() interface, same error classes. Generated from the same OpenAPI spec. Publish to PyPI as beta.                                                                   | Python SDK    | **BUILD** |
| **14**  | Next.js dashboard on Vercel: transaction list (agent, amount, status, purpose, date), budget config form (set limits per agent), agent list with today\'s spend vs limit. Reads from /v1/dashboard/\* endpoints.                           | Dashboard     | **BUILD** |
| **15**  | Integration test: find someone who has not seen your code. Give them the SDK README. Time how long it takes them to make a test payment. Target is under 15 minutes. Fix every rough edge they hit.                                        | 15-min test   | **SHIP**  |

|                                                                                                                                                                               |
|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ✅ Week 3 done when: a developer who has never seen your code installs the SDK and makes a test payment in under 15 minutes. Time this literally. If it takes longer, fix it. |

<table>
<colgroup>
<col style="width: 15%" />
<col style="width: 84%" />
</colgroup>
<tbody>
<tr class="odd">
<td><strong>W4</strong></td>
<td><p><strong>Ship</strong></p>
<p><em>Go live and find your first customer. Stop adding features.</em></p></td>
</tr>
</tbody>
</table>

The product is done. Week 4 is not about building more --- it is about going live and getting one real company to use it. Every hour you spend coding this week is an hour you are not spending finding your first customer.

|            |                                                                                                                                                                                                                                                            |             |          |
|------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-------------|----------|
| **Day**    | **Task**                                                                                                                                                                                                                                                   | **Output**  | **Tag**  |
| **16**     | Switch to Stripe live mode. Verify the full end-to-end flow with a real payment method. Set up Sentry alerts so you get an email on every unhandled error. Add basic structured logging (request ID, agent ID on every log line).                          | Live mode   | **SHIP** |
| **17**     | Self-serve onboarding: org signs up, creates first agent, gets API key, sees the dashboard. This must work without you being in the room. Write a single-page quick-start that gets a developer from zero to first transaction.                            | Onboarding  | **SHIP** |
| **18--20** | Outreach. Email 30 AI-heavy companies --- YC portfolio, LangChain ecosystem, anyone building agents in production. Offer free first month, 30-minute setup call. Your goal is three companies using the SDK in their staging environment by end of week 4. | First users | **SHIP** |

|                                                                                                                                                                                                                |
|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| ✅ Week 4 done when: at least one company has integrated the SDK in their staging environment and made a real transaction. That is your proof of concept for any future conversation with Stripe or investors. |

**6. What Not to Build in These Four Weeks**

Every item below is a reasonable future feature. None of them are needed to get a paying customer. If you start building any of these, you are procrastinating.

|                                       |                                                                                    |
|---------------------------------------|------------------------------------------------------------------------------------|
| **Slack approval notifications**      | Email works fine. Slack integration adds a week and zero revenue.                  |
| **Webhook system**                    | Polling works for MVP. Real customers will ask for webhooks --- then you build it. |
| **Merchant whitelist / verification** | Let the payer org control which merchants are allowed. Ship that later.            |
| **Multi-currency**                    | USD only. Every enterprise customer you talk to will be on USD to start.           |
| **Team roles and permissions**        | One admin per org. Role-based access control is a paid tier feature.               |
| **Agent-to-agent payments**           | Interesting idea. Not the MVP. Not even close.                                     |
| **SOC 2 compliance work**             | Required for large enterprises. Not required to close your first five customers.   |
| **Mobile app**                        | There is no mobile use case for this product.                                      |
| **Analytics and reporting**           | The transaction list in the dashboard is enough for MVP.                           |
| **Docker / Kubernetes / AWS**         | Railway handles all of this. Do not touch infrastructure for four weeks.           |

**7. Go / No-Go Before Pitching Stripe**

Do not reach out to Stripe until every box below is ticked. These are not arbitrary --- they are exactly what Stripe\'s team will ask in the first ten minutes of any meeting.

|     |                                                                                                                                             |
|-----|---------------------------------------------------------------------------------------------------------------------------------------------|
|     | **Requirement**                                                                                                                             |
| ☐   | At least one company has integrated your SDK and made a real transaction.                                                                   |
| ☐   | At least one of those companies is paying you something --- even \$100 per month.                                                           |
| ☐   | Total transactions processed is over 100.                                                                                                   |
| ☐   | Total volume processed through Stripe is over \$1,000.                                                                                      |
| ☐   | Every placeholder stat in your pitch deck is replaced with a real number.                                                                   |
| ☐   | You have spoken with a lawyer about your regulatory position (you are a governance layer, not a money transmitter --- get that in writing). |
| ☐   | A developer you have never met integrated the SDK in under 15 minutes.                                                                      |
| ☐   | You know exactly what you are asking Stripe for: partner, invest, or acquire --- pick one.                                                  |

*AgentPay MVP Plan · Build it. Use it. Sell it. Then scale it.*
