import 'dotenv/config';

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required env: ${key}`);
  return v;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

const nodeEnv = optional('NODE_ENV', 'development');
const dashboardOrigin = optional('DASHBOARD_ORIGIN', 'http://localhost:3001');
const corsOrigins = optional('CORS_ALLOWED_ORIGINS', dashboardOrigin)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const config = {
  port: parseInt(optional('PORT', '3000'), 10),
  nodeEnv,

  database: {
    url:
      nodeEnv === 'test'
        ? optional('DATABASE_URL', '')
        : required('DATABASE_URL'),
  },

  redis: {
    url:
      nodeEnv === 'test'
        ? optional('REDIS_URL', '')
        : required('REDIS_URL'),
  },

  sentry: {
    dsn: process.env.SENTRY_DSN ?? '',
    environment: nodeEnv,
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
    dashboardOrigin,
    // In non-test environments, JWT_SECRET must be explicitly set.
    jwtSecret:
      nodeEnv === 'test'
        ? optional('JWT_SECRET', 'test-secret-not-for-production')
        : required('JWT_SECRET'),
  },

  cors: {
    allowedOrigins: corsOrigins,
  },
} as const;
