import { query } from '../db/client.js';
import { redisCommand, getRedis } from '../redis/client.js';

const BUDGET_CACHE_TTL_SEC = 10;
const BUDGET_CACHE_PREFIX = 'agentpay:budget:';

export interface BudgetLimits {
  dailyLimitCents: number;
  perTxLimitCents: number;
  approvalThresholdCents: number;
}

export async function getBudgetLimits(agentId: string): Promise<BudgetLimits | null> {
  const redis = getRedis();
  if (redis) {
    const cached = await redis.get(BUDGET_CACHE_PREFIX + agentId);
    if (cached) {
      try {
        return JSON.parse(cached) as BudgetLimits;
      } catch {
        /* ignore */
      }
    }
  }

  const result = await query<{ daily_limit_cents: number; per_tx_limit_cents: number; approval_threshold_cents: number }>(
    `SELECT daily_limit_cents, per_tx_limit_cents, approval_threshold_cents
     FROM budget_limits WHERE agent_id = $1`,
    [agentId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const limits: BudgetLimits = {
    dailyLimitCents: row.daily_limit_cents,
    perTxLimitCents: row.per_tx_limit_cents,
    approvalThresholdCents: row.approval_threshold_cents,
  };

  if (redis) {
    await redis.setex(BUDGET_CACHE_PREFIX + agentId, BUDGET_CACHE_TTL_SEC, JSON.stringify(limits));
  }
  return limits;
}

function todayKey(agentId: string): string {
  const yyyy = new Date().toISOString().slice(0, 10);
  return `agentpay:spend:${agentId}:${yyyy}`;
}

function ttlToMidnight(): number {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.floor((midnight.getTime() - now.getTime()) / 1000));
}

export async function addDailySpend(agentId: string, amountCents: number): Promise<number> {
  const key = todayKey(agentId);
  return redisCommand(async (r) => {
    const newTotal = await r.incrby(key, amountCents);
    const ttl = await r.ttl(key);
    if (ttl === -1) await r.expire(key, ttlToMidnight());
    return newTotal;
  });
}

export async function getDailySpend(agentId: string): Promise<number> {
  const key = todayKey(agentId);
  const total = await redisCommand(async (r) => {
    const v = await r.get(key);
    return v ? parseInt(v, 10) : 0;
  });
  return total;
}

/** Atomically reserve daily spend. If reservation would exceed dailyLimitCents, rolls back and returns ok: false. */
export async function reserveDailySpend(
  agentId: string,
  amountCents: number,
  dailyLimitCents: number
): Promise<{ ok: true; newTotal: number } | { ok: false }> {
  const key = todayKey(agentId);
  const script = `
    local k = KEYS[1]
    local amount = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local ttl = tonumber(ARGV[3])
    local newTotal = redis.call('INCRBY', k, amount)
    if newTotal > limit then
      redis.call('DECRBY', k, amount)
      return {0, 0}
    end
    redis.call('EXPIRE', k, ttl)
    return {1, newTotal}
  `;
  const ttl = ttlToMidnight();
  const result = await redisCommand(async (r) => {
    const out = await r.eval(script, 1, key, amountCents, dailyLimitCents, ttl);
    return out as [number, number];
  });
  if (result[0] === 0) return { ok: false };
  return { ok: true, newTotal: result[1] };
}


export async function releaseDailySpend(agentId: string, amountCents: number): Promise<number> {
  const key = todayKey(agentId);
  return redisCommand(async (r) => {
    const newTotal = await r.decrby(key, amountCents);
    if (newTotal < 0) {
      await r.set(key, '0');
      await r.expire(key, ttlToMidnight());
      return 0;
    }
    return newTotal;
  });
}

export type BudgetCheckResult =
  | { ok: true; underThreshold: boolean; dailyLimitCents: number }
  | { ok: false; reason: 'no_limits' | 'daily_exceeded' | 'per_tx_exceeded' };

export async function checkBudget(agentId: string, amountCents: number): Promise<BudgetCheckResult> {
  const limits = await getBudgetLimits(agentId);
  if (!limits) return { ok: false, reason: 'no_limits' };
  if (amountCents > limits.perTxLimitCents) return { ok: false, reason: 'per_tx_exceeded' };

  const dailySpend = await getDailySpend(agentId);
  if (dailySpend + amountCents > limits.dailyLimitCents) return { ok: false, reason: 'daily_exceeded' };

  const underThreshold = amountCents <= limits.approvalThresholdCents;
  return { ok: true, underThreshold, dailyLimitCents: limits.dailyLimitCents };
}
