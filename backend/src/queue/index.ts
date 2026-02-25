import { Queue, Worker, type Job } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config.js';
import { getRedis } from '../redis/client.js';

let connection: Redis | null = null;
if (config.redis.url && !process.env.VITEST) {
  connection = new Redis(config.redis.url, { maxRetriesPerRequest: null });
}

export const stripeChargeQueue =
  connection &&
  new Queue('stripe-charge', {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
  });

export const approvalEmailQueue =
  connection &&
  new Queue('approval-email', {
    connection,
    defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 1000 } },
  });

export function createStripeChargeWorker(
  processor: (data: { transactionId: string }) => Promise<void>
): Worker<{ transactionId: string }> | null {
  if (!connection) return null;
  return new Worker<{ transactionId: string }>(
    'stripe-charge',
    async (job: Job<{ transactionId: string }>) => {
      await processor(job.data);
    },
    { connection }
  );
}

export function createApprovalEmailWorker(
  processor: (data: { transactionId: string }) => Promise<void>
): Worker<{ transactionId: string }> | null {
  if (!connection) return null;
  return new Worker<{ transactionId: string }>(
    'approval-email',
    async (job: Job<{ transactionId: string }>) => {
      await processor(job.data);
    },
    { connection }
  );
}

export { getRedis };
