"""Live smoke test for the Python SDK against production.

Read-heavy: issues exactly one demo token, verifies it, marks it used.
"""
import sys

from rightos import RightOS, RightOSError

demo = RightOS(api_key="rk_demo_00000000000000000000")
pub = RightOS()
failures = 0


def check(name, ok, extra=""):
    global failures
    print(f"{'OK ' if ok else 'NG '} {name}{' - ' + str(extra) if extra else ''}")
    if not ok:
        failures += 1


plans = pub.list_plans()
check("list_plans returns 5 plans", len(plans) == 5, len(plans))

policy = pub.get_location_policy("loc_ev")
check("loc_ev policy is non-transferable", policy["policy"]["transferable"] is False)

defs = pub.list_policies()
check(
    "list_policies returns 7 presets and >= 10 country overlays",
    len(defs["presets"]) == 7 and len(defs["countryOverlays"]) >= 10,
    f"presets={len(defs['presets'])} overlays={len(defs['countryOverlays'])}",
)

try:
    RightOS(api_key="rk_live_invalid").list_locations()
    check("invalid key raises RightOSError(401)", False)
except RightOSError as e:
    check("invalid key raises RightOSError(401)", e.status == 401, e.code)

locations = demo.list_locations()
check("demo list_locations > 0", len(locations) > 0, len(locations))

issued = demo.issue_token(location_id=locations[0]["id"], title="SDK live test (py)")
check("issue_token returns walletUrl", issued["token"]["id"] in issued["walletUrl"])

verified = pub.verify_token(issued["token"]["id"], issued["verificationCode"])
check("verify_token -> success", verified["result"] == "success", verified["result"])

used = demo.use_token(issued["token"]["id"])
check("use_token -> used", used["status"] == "used", used["status"])

again = pub.verify_token(issued["token"]["id"], issued["verificationCode"])
check("re-verify -> already_used", again["result"] == "already_used", again["result"])

# webhooks (v0.4.0): demo org can list but not register
hooks = demo.list_webhooks()
check("demo list_webhooks returns list", isinstance(hooks, list))
try:
    demo.create_webhook("https://example.com/hook")
    check("demo create_webhook raises 403 demo_org", False)
except RightOSError as e:
    check(
        "demo create_webhook raises 403 demo_org",
        e.status == 403 and e.code == "demo_org",
        e.code,
    )

# webhook signature helper (offline)
import hashlib
import hmac as _hmac
import json as _json
import time as _time

from rightos import verify_webhook_signature

_secret = "whsec_selftest"
_body = _json.dumps({"id": "evt_1"})
_t = int(_time.time())
_v1 = _hmac.new(_secret.encode(), f"{_t}.{_body}".encode(), hashlib.sha256).hexdigest()
check(
    "verify_webhook_signature accepts valid signature",
    verify_webhook_signature(_secret, f"t={_t},v1={_v1}", _body),
)
check(
    "verify_webhook_signature rejects tampered body",
    not verify_webhook_signature(_secret, f"t={_t},v1={_v1}", _body + "x"),
)

print("ALL PASS" if failures == 0 else f"{failures} FAILURES")
sys.exit(0 if failures == 0 else 1)
