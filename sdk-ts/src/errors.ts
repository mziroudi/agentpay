export class AgentPayError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'AgentPayError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BudgetExceededError extends AgentPayError {
  constructor(message = 'Budget exceeded', public readonly reason?: string) {
    super(message, 402, 'budget_exceeded');
    this.name = 'BudgetExceededError';
  }
}

export class ApprovalTimeoutError extends AgentPayError {
  constructor(message = 'Approval timed out') {
    super(message, 408, 'approval_timeout');
    this.name = 'ApprovalTimeoutError';
  }
}

export class PaymentDeclinedError extends AgentPayError {
  constructor(message = 'Payment declined') {
    super(message, 402, 'payment_declined');
    this.name = 'PaymentDeclinedError';
  }
}

export class RateLimitError extends AgentPayError {
  constructor(message = 'Too many requests', public readonly retryAfter?: number) {
    super(message, 429, 'rate_limit');
    this.name = 'RateLimitError';
  }
}
