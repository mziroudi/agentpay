import 'dotenv/config';

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const config = {
  port: parseInt(optional('PORT', '3000'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),

  database: {
    url: optional('DATABASE_URL', ''),
  },

  redis: {
    url: optional('REDIS_URL', ''),
  },

  sentry: {
    dsn: process.env.SENTRY_DSN ?? '',
    environment: optional('NODE_ENV', 'development'),
  },

  stripe: {
    secretKey: optional('STRIPE_SECRET_KEY', ''),
    webhookSecret: optional('STRIPE_WEBHOOK_SECRET', ''),
  },

  resend: {
    apiKey: optional('RESEND_API_KEY', ''),
    fromEmail: optional('RESEND_FROM_EMAIL', 'AgentPay <noreply@agentpay.dev>'),
  },

  app: {
    baseUrl: optional('APP_BASE_URL', 'http://localhost:3000'),
    jwtSecret: optional('JWT_SECRET', 'dev-secret-change-in-production-min-32-chars'),
  },
} as const;
