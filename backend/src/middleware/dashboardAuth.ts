import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface DashboardSession {
  org_id: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    dashboardSession?: DashboardSession;
  }
}

export async function requireDashboardSession(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const cookieHeader = request.headers.cookie;
  const cookie = cookieHeader?.split(';').map((c) => c.trim()).find((c) => c.startsWith('agentpay_session='))?.split('=')[1];
  const token = bearer || cookie;
  if (!token) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }
  try {
    const payload = jwt.verify(token, config.app.jwtSecret) as DashboardSession;
    request.dashboardSession = payload;
  } catch {
    return reply.status(401).send({ error: 'Invalid or expired session' });
  }
}
