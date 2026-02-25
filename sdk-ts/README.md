# @agentpay/sdk

TypeScript/JavaScript SDK for [AgentPay](https://agentpay.dev) — payment requests with budget enforcement and human approval.

## Install

```bash
npm install @agentpay/sdk
```

## Quick start

```typescript
import { AgentPay } from '@agentpay/sdk';

const agentpay = new AgentPay({
  baseUrl: 'https://api.agentpay.dev',
  apiKey: process.env.AGENTPAY_API_KEY!,
});

// Request a payment (auto-approved if under threshold, else pending human approval)
const result = await agentpay.payRequest({
  amount_cents: 1000,
  purpose: 'API usage',
  merchant: 'OpenAI',
});

if (result.status === 'approved') {
  console.log('Charged:', result.transaction_id);
} else if (result.status === 'pending') {
  // Wait for admin to approve
  const final = await agentpay.waitForApproval(result.transaction_id);
  console.log('Final status:', final.status);
}
```

## Errors

- `BudgetExceededError` (402) — daily or per-tx limit exceeded
- `RateLimitError` (429) — too many requests
- `PaymentDeclinedError` — human declined the payment
- `ApprovalTimeoutError` — approval link expired or timed out

Retries: the SDK retries on 5xx with exponential backoff. It does not retry on 4xx.

## API

- `payRequest(options)` — submit a payment request; returns `{ status, transaction_id }`
- `getTransaction(id)` — fetch transaction status
- `waitForApproval(transactionId, options?)` — poll until terminal status (completed/declined/timed_out)
