import type { FastifyRequest, FastifyReply } from 'fastify';
import { getRedis } from '../redis/client.js';
import { appendAudit } from '../services/audit.js';

const RATE_LIMIT = 20;
const RATE_WINDOW_SEC = 60;

export async function rateLimitByAgent(request: FastifyRequest & { agent?: { agentId: string } }, reply: FastifyReply) {
  const agent = request.agent;
  if (!agent) return;

  const redis = getRedis();
  if (!redis) return;

  const key = `agentpay:rate:${agent.agentId}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, RATE_WINDOW_SEC);
  }
  if (count > RATE_LIMIT) {
    await appendAudit({
      agentId: agent.agentId,
      action: 'rate_limited',
      details: { count, limit: RATE_LIMIT },
    });
    return reply.status(429).send({
      error: 'Too Many Requests',
      retry_after: RATE_WINDOW_SEC,
    });
  }
}
