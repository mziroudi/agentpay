import type { FastifyRequest, FastifyReply } from 'fastify';
import { redisCommand } from '../redis/client.js';
import { config } from '../config.js';
import { appendAudit } from '../services/audit.js';

const RATE_LIMIT = 20;
const RATE_WINDOW_SEC = 60;

export async function rateLimitByAgent(request: FastifyRequest & { agent?: { agentId: string } }, reply: FastifyReply) {
  const agent = request.agent;
  if (!agent) return;
  if (config.nodeEnv === 'test') return;

  const key = `agentpay:rate:${agent.agentId}`;
  const count = await redisCommand(async (r) => {
    const c = await r.incr(key);
    if (c === 1) await r.expire(key, RATE_WINDOW_SEC);
    return c;
  });
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
