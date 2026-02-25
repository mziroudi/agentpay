# agentpay

Python SDK for AgentPay — payment requests with budget enforcement and human approval.

## Install

```bash
pip install agentpay
```

## Quick start

```python
from agentpay import AgentPay

client = AgentPay(base_url="https://api.agentpay.dev", api_key="your-api-key")

result = client.pay_request(amount_cents=1000, purpose="API usage", merchant="OpenAI")

if result["status"] == "approved":
    print("Charged:", result["transaction_id"])
elif result["status"] == "pending":
    final = client.wait_for_approval(result["transaction_id"])
    print("Final status:", final["status"])
```

## Errors

- `BudgetExceededError` — daily or per-tx limit exceeded
- `RateLimitError` — too many requests
- `PaymentDeclinedError` — human declined
- `ApprovalTimeoutError` — approval timed out
