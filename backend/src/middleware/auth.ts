import { createHash } from 'node:crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { query } from '../db/client.js';

export interface AgentContext {
  agentId: string;
  organizationId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    agent?: AgentContext;
  }
}

function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey, 'utf-8').digest('hex');
}

export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'Missing or invalid Authorization header' });
  }
  const apiKey = authHeader.slice(7).trim();
  if (!apiKey) {
    return reply.status(401).send({ error: 'Missing API key' });
  }
  const apiKeyHash = hashApiKey(apiKey);
  const result = await query<{ id: string; organization_id: string }>(
    `SELECT id, organization_id FROM agents WHERE api_key_hash = $1 AND is_active = true`,
    [apiKeyHash]
  );
  if (result.rows.length === 0) {
    return reply.status(401).send({ error: 'Invalid or inactive API key' });
  }
  const row = result.rows[0];
  request.agent = { agentId: row.id, organizationId: row.organization_id };
}
