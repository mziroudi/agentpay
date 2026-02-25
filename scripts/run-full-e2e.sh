#!/usr/bin/env bash
# Run full E2E: start Postgres+Redis, migrate, seed, start API, run demo, then stop.
# Requires: Docker, Node 20, backend and sdk-ts built.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Starting Postgres and Redis (Docker)..."
docker compose up -d
trap 'docker compose down' EXIT

echo "== Waiting for Postgres..."
until docker compose exec -T postgres pg_isready -U agentpay 2>/dev/null; do sleep 1; done
echo "== Waiting for Redis..."
until docker compose exec -T redis redis-cli ping 2>/dev/null | grep -q PONG; do sleep 1; done

export DATABASE_URL="postgresql://agentpay:agentpay@localhost:5432/agentpay"
export REDIS_URL="redis://localhost:6379"
export JWT_SECRET="e2e-test-secret-at-least-32-characters-long"
export PORT=3000

echo "== Migrate..."
cd "$ROOT/backend" && npm run migrate
echo "== Seed (capturing API key)..."
SEED_OUT=$(npm run seed 2>&1)
API_KEY=$(echo "$SEED_OUT" | grep "Authorization: Bearer" | awk '{print $NF}')
if [ -z "$API_KEY" ]; then
  API_KEY=$(echo "$SEED_OUT" | grep "API Key" | sed 's/.*: //')
fi
if [ -z "$API_KEY" ]; then
  echo "Could not parse API key from seed output. Run: cd backend && npm run seed"
  exit 1
fi
echo "Using API key: ${API_KEY:0:8}..."

echo "== Starting backend (background)..."
npm run dev &
API_PID=$!
trap "kill $API_PID 2>/dev/null; docker compose down" EXIT
sleep 3

echo "== Health check..."
curl -sf http://localhost:3000/health || { echo "Backend not responding"; exit 1; }
echo ""

echo "== Payment request (small amount)..."
RES=$(curl -s -X POST http://localhost:3000/v1/payment-request \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $API_KEY" \
  -d '{"amount_cents":500,"idempotency_key":"e2e-'$(date +%s)'","purpose":"E2E test"}')
echo "$RES" | head -c 500
echo ""
if echo "$RES" | grep -q '"status"'; then
  echo "== E2E OK: payment-request returned a status."
else
  echo "== E2E FAIL: unexpected response"
  exit 1
fi

echo "== Done. Shutting down."
