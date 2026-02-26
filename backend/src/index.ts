import { Readable } from 'node:stream';
import * as Sentry from '@sentry/node';
import Fastify, { type FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import { redisCommand } from './redis/client.js';
import paymentRequestRoutes from './routes/payment-request.js';
import stripeWebhookRoutes from './routes/stripe-webhook.js';
import approveDeclineRoutes from './routes/approve-decline.js';
import transactionRoutes from './routes/transactions.js';
import dashboardAuthRoutes from './routes/dashboard-auth.js';
import dashboardRoutes from './routes/dashboard.js';
import { createStripeChargeWorker, createApprovalEmailWorker } from './queue/index.js';
import { processStripeCharge } from './queue/processors/stripeCharge.js';
import { processApprovalEmail } from './queue/processors/approvalEmail.js';

if (config.sentry.dsn) {
  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.sentry.environment,
    tracesSampleRate: 0.1,
  });
}

const app = Fastify({ logger: true });

app.addHook('preParsing', async (request, _reply, payload) => {
  if (request.url.startsWith('/v1/stripe/webhook') && request.method === 'POST') {
    const chunks: Buffer[] = [];
    for await (const chunk of payload) chunks.push(Buffer.from(chunk));
    const buf = Buffer.concat(chunks);
    (request as FastifyRequest & { rawBody?: string }).rawBody = buf.toString('utf-8');
    return Readable.from(buf);
  }
  return payload;
});

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const ok = config.cors.allowedOrigins.includes(origin);
    cb(ok ? null : new Error('CORS origin not allowed'), ok);
  },
  credentials: true,
});

app.setErrorHandler((err, _request, reply) => {
  if (config.sentry.dsn) {
    Sentry.captureException(err);
  }
  reply.status(err.statusCode ?? 500).send({
    error: err.message ?? 'Internal Server Error',
  });
});

app.get('/health', async (_request, reply) => {
  return reply.send({ status: 'ok', timestamp: new Date().toISOString() });
});

await app.register(paymentRequestRoutes);
await app.register(stripeWebhookRoutes);
await app.register(approveDeclineRoutes);
await app.register(transactionRoutes);
await app.register(dashboardAuthRoutes);
await app.register(dashboardRoutes);

const stripeWorker = createStripeChargeWorker(async (data) => {
  await processStripeCharge(data.transactionId);
});
if (stripeWorker) {
  stripeWorker.on('failed', (job, err) => {
    app.log.error({ jobId: job?.id, err }, 'Stripe charge job failed');
  });
}
const approvalEmailWorker = createApprovalEmailWorker(async (data) => {
  await processApprovalEmail(data.transactionId);
});
if (approvalEmailWorker) {
  approvalEmailWorker.on('failed', (job, err) => {
    app.log.error({ jobId: job?.id, err }, 'Approval email job failed');
  });
}

const start = async () => {
  try {
    if (config.nodeEnv !== 'test') {
      await redisCommand((r) => r.ping());
      app.log.info('Redis connected');
    }
    await app.listen({ port: config.port, host: '0.0.0.0' });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
