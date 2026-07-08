"""RightOS Python SDK (zero-dependency, urllib-based).

RightOS is privacy-preserving rights verification infrastructure:
digital QR tickets ("Right Tokens") for queues, reservations, EV charging,
and package pickup. It verifies that a valid right is present - never who
the person is.

API reference: https://rightos.i-s3.com/openapi.json

Example:
    >>> from rightos import RightOS
    >>> client = RightOS(api_key="rk_live_...")
    >>> issued = client.issue_token(location_id="loc_...", title="Queue ticket")
    >>> # Hand issued["walletUrl"] (QR page) to your customer.
    >>> outcome = client.verify_token(issued["token"]["id"], issued["verificationCode"])
    >>> outcome["result"]
    'success'
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Optional

__all__ = [
    "RightOS",
    "RightOSError",
    "DEFAULT_BASE_URL",
    "verify_webhook_signature",
]
__version__ = "0.4.1"

DEFAULT_BASE_URL = "https://rightos.i-s3.com"


class RightOSError(Exception):
    """Raised for any non-2xx API response.

    Attributes:
        status: HTTP status code.
        code: Machine-readable error code (e.g. "invalid_api_key",
            "policy_transfer_disabled", "transfer_limit_reached").
        retry_after_sec: Seconds to wait before retrying (present on 429).
    """

    def __init__(self, status: int, code: str, retry_after_sec: Optional[int] = None):
        super().__init__(f"RightOS API error {status}: {code}")
        self.status = status
        self.code = code
        self.retry_after_sec = retry_after_sec


class RightOS:
    """RightOS API client.

    Operator methods require ``api_key``. Public methods (verify_token,
    transfer_token, get_token, get_location_policy, list_plans,
    register_organization) work without a key.
    """

    def __init__(self, api_key: Optional[str] = None, base_url: str = DEFAULT_BASE_URL, timeout: float = 15.0):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    # ---------- internals ----------

    def _request(self, method: str, path: str, body: Any = ...) -> Any:
        headers = {"User-Agent": f"rightos-sdk-python/{__version__}"}
        data = None
        if body is not ...:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
        if self.api_key:
            headers["x-rightos-key"] = self.api_key
        req = urllib.request.Request(
            f"{self.base_url}{path}", data=data, headers=headers, method=method
        )
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return json.loads(res.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            code = "unknown_error"
            try:
                payload = json.loads(e.read().decode("utf-8"))
                code = payload.get("error", code)
            except Exception:
                pass
            retry_after = e.headers.get("Retry-After")
            raise RightOSError(
                e.code, code, int(retry_after) if retry_after else None
            ) from None

    # ---------- Public endpoints (no API key required) ----------

    def list_plans(self) -> list[dict]:
        """List pricing plans (globally uniform pricing)."""
        return self._request("GET", "/api/rightos/plans")["plans"]

    def get_token(self, token_id: str) -> dict:
        """Get a Right Token (never includes the secret hash)."""
        return self._request("GET", f"/api/rightos/tokens/{token_id}")["token"]

    def verify_token(self, token_id: str, verification_code: str) -> dict:
        """Verify a Right Token by its verificationCode.

        Returns ``{"result": "success" | "failed" | "expired" | "cancelled"
        | "already_used", "token": {...}}``. Rate limited: 10/min per
        IP+token, 60/min per IP.
        """
        return self._request(
            "POST",
            f"/api/rightos/tokens/{token_id}/verify",
            {"verificationCode": verification_code},
        )

    def transfer_token(self, token_id: str, current_verification_code: str) -> dict:
        """Transfer a right (re-keying). Only the current holder can transfer.

        Subject to the location policy - raises RightOSError with code
        "policy_transfer_disabled" or "transfer_limit_reached" (HTTP 409).
        The new verificationCode and walletUrl are returned exactly once.
        """
        return self._request(
            "POST",
            f"/api/rightos/tokens/{token_id}/transfer",
            {"verificationCode": current_verification_code},
        )

    def holder_cancel_token(self, token_id: str, verification_code: str) -> dict:
        """Self-cancel a token as its current holder (Policy Phase 2).

        Possession is proven by the verificationCode. Raises RightOSError
        with code "policy_cancel_disabled" (HTTP 409) when the location's
        policy forbids holder self-cancellation. Rate limited like verify.
        """
        return self._request(
            "POST",
            f"/api/rightos/tokens/{token_id}/holder-cancel",
            {"verificationCode": verification_code},
        )["token"]

    def get_location_policy(self, location_id: str) -> dict:
        """Get a location's effective policy (public, for transparency)."""
        return self._request("GET", f"/api/rightos/locations/{location_id}/policy")

    def list_policies(self) -> dict:
        """List all industry presets and country overlays (public).

        Returns the policy knowledge base: ``{"resolutionOrder": [...],
        "presets": {...}, "countryOverlays": {...}, "note": "..."}``.
        Useful for choosing a location type or proposing policy overrides.
        Defaults, not legal advice.
        """
        return self._request("GET", "/api/rightos/policies")

    def register_organization(
        self, name: str, contact_email: str, plan_id: str = "free", country: str = "JP"
    ) -> dict:
        """Register an organization.

        The returned apiKey is shown EXACTLY ONCE - store it securely.
        Rate limited: 5/hour per IP.
        """
        return self._request(
            "POST",
            "/api/rightos/organizations",
            {"name": name, "contactEmail": contact_email, "planId": plan_id, "country": country},
        )

    # ---------- Operator endpoints (API key required) ----------

    def list_locations(self) -> list[dict]:
        """List your organization's locations."""
        return self._request("GET", "/api/rightos/locations")["locations"]

    def create_location(
        self,
        name: str,
        address: str = "",
        type: str = "other",
        timezone: str = "Asia/Tokyo",
    ) -> dict:
        """Create a location. Raises 402 when the plan's location limit is exceeded."""
        return self._request(
            "POST",
            "/api/rightos/locations",
            {"name": name, "address": address, "type": type, "timezone": timezone},
        )["location"]

    def set_location_policy(self, location_id: str, patch: Optional[dict]) -> dict:
        """Override a location's policy (partial update).

        Pass ``None`` to reset to the industry preset.
        """
        return self._request(
            "PUT", f"/api/rightos/locations/{location_id}/policy", patch
        )

    def get_location_policy_history(self, location_id: str) -> list[dict]:
        """Policy change audit log for a location (own organization only).

        Records are append-only and returned newest first.
        """
        return self._request(
            "GET", f"/api/rightos/locations/{location_id}/policy/history"
        )["changes"]

    def issue_token(
        self,
        location_id: str,
        title: str,
        description: str = "",
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
    ) -> dict:
        """Issue a Right Token.

        The verificationCode and walletUrl are returned exactly once -
        hand the walletUrl (QR page) to the end user. Raises 402 when the
        plan's monthly token limit is exceeded.
        """
        body: dict[str, Any] = {"locationId": location_id, "title": title}
        if description:
            body["description"] = description
        if start_time:
            body["startTime"] = start_time
        if end_time:
            body["endTime"] = end_time
        return self._request("POST", "/api/rightos/tokens/issue", body)

    def use_token(self, token_id: str) -> dict:
        """Mark a token as used (own organization only)."""
        return self._request("POST", f"/api/rightos/tokens/{token_id}/use")["token"]

    def cancel_token(self, token_id: str) -> dict:
        """Cancel a token (own organization only)."""
        return self._request("POST", f"/api/rightos/tokens/{token_id}/cancel")["token"]

    def list_webhooks(self) -> list:
        """List your organization's webhooks (never includes signing secrets).

        Each webhook may include ``lastDelivery`` (at, event, ok, status?, error?),
        ``deliveredCount``, and ``failedCount`` for delivery observability.
        """
        return self._request("GET", "/api/rightos/webhooks")["webhooks"]

    def create_webhook(self, url: str, events: Optional[list] = None) -> dict:
        """Register a webhook (up to 3 per organization; https only).

        Returns ``{"webhook": {...}, "secret": "whsec_...", ...}``.
        The ``secret`` is shown EXACTLY ONCE — store it securely and use it
        with :func:`verify_webhook_signature`. ``events`` defaults to all four
        (token.verified / token.used / token.cancelled / token.transferred).
        """
        body: dict = {"url": url}
        if events is not None:
            body["events"] = events
        return self._request("POST", "/api/rightos/webhooks", body)

    def delete_webhook(self, webhook_id: str) -> dict:
        """Delete a webhook (own organization only)."""
        return self._request("DELETE", f"/api/rightos/webhooks/{webhook_id}")

    def export_data(self) -> dict:
        """Export all organization data as JSON (no lock-in; contains no secrets)."""
        return self._request("GET", "/api/rightos/export")

    def rotate_api_key(self) -> str:
        """Re-issue the API key. The old key is invalidated immediately.

        The new key is returned exactly once. This client switches to the
        new key automatically.
        """
        new_key = self._request("POST", "/api/rightos/organizations/rotate-key")["apiKey"]
        self.api_key = new_key
        return new_key

    def delete_organization(self, confirm_name: str) -> dict:
        """Permanently delete the organization and all its data (irreversible).

        ``confirm_name`` must exactly match the organization name.
        """
        return self._request(
            "POST", "/api/rightos/organizations/delete", {"confirm": confirm_name}
        )


def verify_webhook_signature(
    secret: str,
    signature_header: str,
    raw_body: bytes | str,
    tolerance_sec: int = 300,
) -> bool:
    """Verify a webhook delivery's signature.

    Header ``x-rightos-signature`` has the format
    ``t=<unix seconds>,v1=<hex HMAC-SHA256(secret, f"{t}.{raw_body}")>``.
    Pass the RAW request body (bytes or str, before JSON parsing).

    ``tolerance_sec`` rejects deliveries older than that many seconds
    (replay protection). Pass 0 to skip the timestamp check.
    """
    import hashlib
    import hmac as _hmac
    import re
    import time

    match = re.search(r"(?:^|,)t=(\d+),v1=([0-9a-f]+)", signature_header.strip())
    if not match:
        return False
    t, v1 = match.group(1), match.group(2)
    if tolerance_sec > 0 and abs(time.time() - int(t)) > tolerance_sec:
        return False
    body = raw_body.decode("utf-8") if isinstance(raw_body, bytes) else raw_body
    expected = _hmac.new(
        secret.encode("utf-8"), f"{t}.{body}".encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return _hmac.compare_digest(expected, v1)
