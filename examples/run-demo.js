#!/usr/bin/env node
/**
 * AgentPay SDK demo – simulates an AI agent making payment requests.
 *
 * Prerequisites:
 *   1. Backend running (cd backend && npm run dev)
 *   2. DB migrated and seeded (npm run migrate && npm run seed in backend)
 *   3. AGENTPAY_API_KEY set to the key printed by seed
 *
 * Run: AGENTPAY_BASE_URL=http://localhost:3000 AGENTPAY_API_KEY=<key> npm run demo
 */

import { AgentPay, BudgetExceededError, RateLimitError } from '@agentpay/sdk';

const BASE_URL = process.env.AGENTPAY_BASE_URL || 'http://localhost:3000';
const API_KEY = process.env.AGENTPAY_API_KEY;

function log(title, data) {
  console.log('\n--- ' + title + ' ---');
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  if (!API_KEY) {
    console.error('Set AGENTPAY_API_KEY (get it from: cd backend && npm run seed)');
    process.exit(1);
  }

  const agentpay = new AgentPay({ baseUrl: BASE_URL, apiKey: API_KEY });

  console.log('AgentPay SDK demo – agent making payment requests');
  console.log('Base URL:', BASE_URL);

  // —— Scenario 1: Small payment (auto-approved under threshold) ——
  try {
    log('1. Small payment ($5) – expect auto-approved', { amount_cents: 500 });
    const small = await agentpay.payRequest({
      amount_cents: 500,
      purpose: 'Demo agent: API usage',
      merchant: 'OpenAI',
      context: { scenario: 'small_auto_approve' },
    });
    log('1. Result', small);

    if (small.transaction_id) {
      const tx = await agentpay.getTransaction(small.transaction_id);
      log('1. Transaction status', tx);
    }
  } catch (e) {
    if (e instanceof BudgetExceededError) log('1. Budget exceeded', { reason: e.reason });
    else if (e instanceof RateLimitError) log('1. Rate limited', { retryAfter: e.retryAfter });
    else log('1. Error', { message: e.message });
  }

  // —— Scenario 2: Larger payment (over threshold → pending human approval) ——
  try {
    log('2. Larger payment ($50) – may be pending if over your approval threshold', { amount_cents: 5000 });
    const large = await agentpay.payRequest({
      amount_cents: 5000,
      purpose: 'Demo agent: premium API call',
      merchant: 'Anthropic',
      context: { scenario: 'large_pending' },
    });
    log('2. Result', large);

    if (large.status === 'pending') {
      console.log('\n  → Pending: check inbox for approval email, or wait for waitForApproval() in code.');
      const tx = await agentpay.getTransaction(large.transaction_id);
      log('2. Transaction status', tx);
    }
  } catch (e) {
    if (e instanceof BudgetExceededError) log('2. Budget exceeded', { reason: e.reason });
    else if (e instanceof RateLimitError) log('2. Rate limited', { retryAfter: e.retryAfter });
    else log('2. Error', { message: e.message });
  }

  // —— Scenario 3: Idempotency – same request twice returns same result ——
  try {
    const idemKey = 'demo-idempotent-' + Date.now();
    log('3a. Idempotent request (first)', { idempotency_key: idemKey });
    const first = await agentpay.payRequest({
      amount_cents: 100,
      idempotency_key: idemKey,
      purpose: 'Idempotency test',
    });
    log('3a. Result', first);

    log('3b. Same idempotency key again (second)', { idempotency_key: idemKey });
    const second = await agentpay.payRequest({
      amount_cents: 100,
      idempotency_key: idemKey,
      purpose: 'Idempotency test',
    });
    log('3b. Result (should have idempotent: true)', second);
  } catch (e) {
    log('3. Error', { message: e.message });
  }

  console.log('\n--- Demo done ---\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
