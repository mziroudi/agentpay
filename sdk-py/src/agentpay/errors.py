class AgentPayError(Exception):
    def __init__(self, message: str, status_code: int | None = None, code: str | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


class BudgetExceededError(AgentPayError):
    def __init__(self, message: str = "Budget exceeded", reason: str | None = None):
        super().__init__(message, 402, "budget_exceeded")
        self.reason = reason


class ApprovalTimeoutError(AgentPayError):
    def __init__(self, message: str = "Approval timed out"):
        super().__init__(message, 408, "approval_timeout")


class PaymentDeclinedError(AgentPayError):
    def __init__(self, message: str = "Payment declined"):
        super().__init__(message, 402, "payment_declined")


class RateLimitError(AgentPayError):
    def __init__(self, message: str = "Too many requests", retry_after: int | None = None):
        super().__init__(message, 429, "rate_limit")
        self.retry_after = retry_after
