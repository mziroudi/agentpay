import time
import hashlib
import json
import requests
from .errors import (
    AgentPayError,
    BudgetExceededError,
    ApprovalTimeoutError,
    PaymentDeclinedError,
    RateLimitError,
)

TERMINAL_STATUSES = ("completed", "declined", "timed_out")


class AgentPay:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        poll_interval_ms: int = 5000,
        max_wait_ms: int = 30 * 60 * 1000,
    ):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.poll_interval_ms = poll_interval_ms
        self.max_wait_ms = max_wait_ms

    def _idempotency_key(self, amount_cents: int, merchant: str = "", purpose: str = "", context: dict | None = None) -> str:
        data = f"{amount_cents}|{merchant}|{purpose}|{json.dumps(context or {}, sort_keys=True)}"
        h = hashlib.sha256(data.encode()).hexdigest()[:16]
        return f"sdk-{h}-{int(time.time() * 1000)}"

    def _request(self, method: str, path: str, **kwargs) -> requests.Response:
        url = f"{self.base_url}{path}"
        headers = {"Authorization": f"Bearer {self.api_key}", **(kwargs.pop("headers", {}))}
        last_err = None
        for attempt in range(4):
            try:
                r = requests.request(method, url, headers=headers, timeout=30, **kwargs)
                if r.status_code >= 500 and attempt < 3:
                    time.sleep(min(2**attempt, 10))
                    continue
                return r
            except requests.RequestException as e:
                last_err = e
                if attempt < 3:
                    time.sleep(min(2**attempt, 10))
        raise last_err or AgentPayError("Request failed")

    def pay_request(
        self,
        amount_cents: int,
        currency: str = "USD",
        purpose: str | None = None,
        merchant: str | None = None,
        idempotency_key: str | None = None,
        context: dict | None = None,
    ) -> dict:
        key = idempotency_key or self._idempotency_key(amount_cents, merchant or "", purpose or "", context)
        payload = {
            "amount_cents": amount_cents,
            "currency": currency,
            "purpose": purpose,
            "merchant": merchant,
            "context": context,
            "idempotency_key": key,
        }
        r = self._request("POST", "/v1/payment-request", json=payload)
        data = r.json() if r.content else {}
        if not r.ok:
            if r.status_code == 402:
                raise BudgetExceededError(data.get("error", "Budget exceeded"), data.get("reason"))
            if r.status_code == 429:
                raise RateLimitError(data.get("error", "Too many requests"), data.get("retry_after"))
            raise AgentPayError(data.get("error", r.text), r.status_code)
        return {"status": data["status"], "transaction_id": data["transaction_id"], "idempotent": data.get("idempotent")}

    def get_transaction(self, transaction_id: str) -> dict:
        r = self._request("GET", f"/v1/transactions/{transaction_id}")
        data = r.json() if r.content else {}
        if not r.ok:
            raise AgentPayError(data.get("error", r.text), r.status_code)
        return data

    def wait_for_approval(
        self,
        transaction_id: str,
        poll_interval_ms: int | None = None,
        max_wait_ms: int | None = None,
    ) -> dict:
        interval = (poll_interval_ms or self.poll_interval_ms) / 1000.0
        deadline = time.time() + (max_wait_ms or self.max_wait_ms) / 1000.0
        while time.time() < deadline:
            tx = self.get_transaction(transaction_id)
            status = tx.get("status", "")
            if status in TERMINAL_STATUSES:
                if status == "declined":
                    raise PaymentDeclinedError()
                if status == "timed_out":
                    raise ApprovalTimeoutError()
                return {"status": status}
            time.sleep(interval)
        raise ApprovalTimeoutError()
