import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { FastifyReply as FReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { Resend } from 'resend';
import { query } from '../db/client.js';
import { redisCommand, getRedis } from '../redis/client.js';
import { config } from '../config.js';

const LOGIN_TOKEN_PREFIX = 'login_token:';
const LOGIN_TOKEN_TTL = 60 * 30; // 30 min
const SESSION_TTL_SEC = 60 * 60; // 1h

interface LoginLinkBody { email: string }
interface SessionPayload { org_id: string; email: string; jti: string }

export default async function dashboardAuthRoutes(app: FastifyInstance) {
  app.post<{ Body: LoginLinkBody }>(
    '/v1/dashboard/login-link',
    async (request: FastifyRequest<{ Body: LoginLinkBody }>, reply: FastifyReply) => {
      const { email } = request.body || {};
      if (!email || typeof email !== 'string') {
        return reply.status(400).send({ error: 'email required' });
      }

      const orgResult = await query<{ id: string }>(
        `SELECT id FROM organizations WHERE admin_email = $1`,
        [email.toLowerCase().trim()]
      );
      if (orgResult.rows.length === 0) {
        return reply.send({ ok: true, message: 'If an account exists, you will receive an email.' });
      }

      const orgId = orgResult.rows[0].id;
      const jti = crypto.randomUUID();
      const token = jwt.sign(
        { org_id: orgId, email: email.trim(), jti },
        config.app.jwtSecret,
        { expiresIn: LOGIN_TOKEN_TTL }
      );

      const redis = getRedis();
      if (redis) {
        await redis.setex(LOGIN_TOKEN_PREFIX + jti, LOGIN_TOKEN_TTL, 'unused');
      }

      if (config.resend.apiKey) {
        const baseUrl = config.app.baseUrl.replace(/\/$/, '');
        const magicUrl = `${baseUrl}/v1/dashboard/magic-login?token=${encodeURIComponent(token)}`;
        const resend = new Resend(config.resend.apiKey);
        await resend.emails.send({
          from: config.resend.fromEmail,
          to: email.trim(),
          subject: 'AgentPay login link',
          html: `<p>Click to log in: <a href="${magicUrl}">Log in to AgentPay</a></p><p>Link expires in 30 minutes.</p>`,
        });
      }

      return reply.send({ ok: true, message: 'If an account exists, you will receive an email.' });
    }
  );

  app.get<{ Querystring: { token: string } }>(
    '/v1/dashboard/magic-login',
    async (request: FastifyRequest<{ Querystring: { token: string } }>, reply: FastifyReply) => {
      const token = request.query?.token;
      if (!token) {
        return reply.status(400).send({ error: 'token required' });
      }

      let payload: SessionPayload;
      try {
        payload = jwt.verify(token, config.app.jwtSecret) as SessionPayload;
      } catch {
        return reply.status(400).send({ error: 'Invalid or expired token' });
      }

      const redis = getRedis();
      if (redis) {
        const key = LOGIN_TOKEN_PREFIX + payload.jti;
        const val = await redis.get(key);
        if (val !== 'unused') {
          return reply.status(400).send({ error: 'Link already used or expired' });
        }
        await redis.setex(key, 60, 'used');
      }

      const sessionToken = jwt.sign(
        { org_id: payload.org_id, email: payload.email },
        config.app.jwtSecret,
        { expiresIn: SESSION_TTL_SEC }
      );

      const redirectUrl = process.env.DASHBOARD_ORIGIN || 'http://localhost:3001';
      const withToken = `${redirectUrl}/dashboard#token=${encodeURIComponent(sessionToken)}`;
      reply
        .header('Set-Cookie', `agentpay_session=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}${config.nodeEnv === 'production' ? '; Secure' : ''}`)
        .redirect(302, withToken);
    }
  );
}
