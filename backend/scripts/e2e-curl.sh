#!/usr/bin/env bash
# Phase 1.4 E2E: Run after migrate + seed. Set API_BASE_URL and API_KEY (from seed output).
# Example: API_BASE_URL=http://localhost:3000 API_KEY=<from-seed> ./scripts/e2e-curl.sh

set -e
BASE="${API_BASE_URL:-http://localhost:3000}"
KEY="${API_KEY:?Set API_KEY (from npm run seed)}"

echo "POST $BASE/v1/payment-request (with API key)"
RES=$(curl -s -w "\n%{http_code}" -X POST "$BASE/v1/payment-request" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"amount_cents": 1000, "idempotency_key": "e2e-'$(date +%s)'", "purpose": "E2E test"}')
HTTP_BODY=$(echo "$RES" | head -n -1)
HTTP_CODE=$(echo "$RES" | tail -n 1)

echo "HTTP $HTTP_CODE"
echo "$HTTP_BODY" | jq . 2>/dev/null || echo "$HTTP_BODY"

if [ "$HTTP_CODE" != "200" ]; then
  echo "Expected 200"
  exit 1
fi
echo "E2E OK: request hit API, auth passed, stub response returned. Check Neon audit_logs for a new row."
