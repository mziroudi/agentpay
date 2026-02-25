#!/usr/bin/env node
/**
 * AgentPay API demo – same scenarios using raw fetch (no SDK).
 * Use this if the SDK isn't built yet.
 *
 * Run: AGENTPAY_BASE_URL=http://localhost:3000 AGENTPAY_API_KEY=<key> npm run demo:api
 */

const BASE_URL = (process.env.AGENTPAY_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_KEY = process.env.AGENTPAY_API_KEY;

function log(title, data) {
  console.log('\n--- ' + title + ' ---');
  console.log(JSON.stringify(data, null, 2));
}

async function api(method, path, body) {
  const opts = {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}${path}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

async function main() {
  if (!API_KEY) {
    console.error('Set AGENTPAY_API_KEY (from: cd backend && npm run seed)');
    process.exit(1);
  }

  console.log('AgentPay API demo (raw fetch)');
  console.log('Base URL:', BASE_URL);

  try {
    log('1. Small payment ($5)', { amount_cents: 500 });
    const small = await api('POST', '/v1/payment-request', {
      amount_cents: 500,
      idempotency_key: 'api-demo-small-' + Date.now(),
      purpose: 'API demo',
      merchant: 'OpenAI',
    });
    log('1. Result', small);

    if (small.transaction_id) {
      const tx = await api('GET', `/v1/transactions/${small.transaction_id}`);
      log('1. Transaction', tx);
    }
  } catch (e) {
    log('1. Error', { message: e.message });
  }

  try {
    log('2. Larger payment ($50)', { amount_cents: 5000 });
    const large = await api('POST', '/v1/payment-request', {
      amount_cents: 5000,
      idempotency_key: 'api-demo-large-' + Date.now(),
      purpose: 'API demo large',
    });
    log('2. Result', large);
  } catch (e) {
    log('2. Error', { message: e.message });
  }

  console.log('\n--- Demo done ---\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
