import {
  AgentPayError,
  BudgetExceededError,
  ApprovalTimeoutError,
  PaymentDeclinedError,
  RateLimitError,
} from './errors';

const TERMINAL_STATUSES = ['completed', 'declined', 'timed_out'] as const;

export interface PayRequestOptions {
  amount_cents: number;
  currency?: string;
  purpose?: string;
  merchant?: string;
  idempotency_key?: string;
  context?: Record<string, unknown>;
}

export interface PayRequestResult {
  status: string;
  transaction_id: string;
  idempotent?: boolean;
}

export interface AgentPayConfig {
  baseUrl: string;
  apiKey: string;
  /** Poll interval in ms for waitForApproval. Default 5000 */
  pollIntervalMs?: number;
  /** Max wait time in ms for waitForApproval. Default 30 minutes */
  maxWaitMs?: number;
}

function createIdempotencyKey(opts: PayRequestOptions): string {
  const parts = [
    String(opts.amount_cents),
    opts.merchant ?? '',
    opts.purpose ?? '',
    JSON.stringify(opts.context ?? {}),
  ];
  const str = parts.join('|');
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    hash = (hash << 5) - hash + c;
    hash = hash & hash;
  }
  return `sdk-${Math.abs(hash).toString(16)}-${Date.now()}`;
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.status >= 500 && attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e as Error;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }
  throw lastErr ?? new Error('Request failed');
}

function throwForStatus(res: Response, body: unknown): never {
  const status = res.status;
  const msg = (body as { error?: string })?.error ?? res.statusText;
  if (status === 402) {
    const reason = (body as { reason?: string })?.reason;
    throw new BudgetExceededError(msg, reason);
  }
  if (status === 429) {
    const retryAfter = (body as { retry_after?: number })?.retry_after;
    throw new RateLimitError(msg, retryAfter);
  }
  if (status === 408) throw new ApprovalTimeoutError(msg);
  throw new AgentPayError(msg, status);
}

export class AgentPay {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly pollIntervalMs: number;
  private readonly maxWaitMs: number;

  constructor(config: AgentPayConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.pollIntervalMs = config.pollIntervalMs ?? 5000;
    this.maxWaitMs = config.maxWaitMs ?? 30 * 60 * 1000;
  }

  async payRequest(opts: PayRequestOptions): Promise<PayRequestResult> {
    const idempotency_key = opts.idempotency_key ?? createIdempotencyKey(opts);
    const body = {
      amount_cents: opts.amount_cents,
      currency: opts.currency ?? 'USD',
      purpose: opts.purpose,
      merchant: opts.merchant,
      context: opts.context,
      idempotency_key,
    };

    const res = await fetchWithRetry(`${this.baseUrl}/v1/payment-request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json().catch(() => ({}))) as PayRequestResult & { error?: string; reason?: string };
    if (!res.ok) {
      if (res.status === 402 && (data as { reason?: string }).reason) {
        throw new BudgetExceededError((data as { error?: string }).error, (data as { reason?: string }).reason);
      }
      if (res.status === 429) {
        throw new RateLimitError(
          (data as { error?: string }).error,
          (data as { retry_after?: number }).retry_after
        );
      }
      throwForStatus(res, data);
    }

    return {
      status: data.status,
      transaction_id: data.transaction_id,
      idempotent: data.idempotent,
    };
  }

  async getTransaction(transactionId: string): Promise<{ id: string; status: string; amount_cents: number; created_at: string }> {
    const res = await fetch(`${this.baseUrl}/v1/transactions/${transactionId}`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    const data = (await res.json().catch(() => ({}))) as { id: string; status: string; amount_cents: number; created_at: string; error?: string };
    if (!res.ok) throwForStatus(res, data);
    return data;
  }

  async waitForApproval(
    transactionId: string,
    options?: { pollIntervalMs?: number; maxWaitMs?: number }
  ): Promise<{ status: string }> {
    const pollInterval = options?.pollIntervalMs ?? this.pollIntervalMs;
    const maxWait = options?.maxWaitMs ?? this.maxWaitMs;
    const deadline = Date.now() + maxWait;

    while (Date.now() < deadline) {
      const tx = await this.getTransaction(transactionId);
      if (TERMINAL_STATUSES.includes(tx.status as (typeof TERMINAL_STATUSES)[number])) {
        if (tx.status === 'declined') throw new PaymentDeclinedError();
        if (tx.status === 'timed_out') throw new ApprovalTimeoutError();
        return { status: tx.status };
      }
      await new Promise((r) => setTimeout(r, pollInterval));
    }

    throw new ApprovalTimeoutError();
  }
}
