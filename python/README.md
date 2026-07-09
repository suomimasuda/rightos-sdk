# rightos-sdk — RightOS Python SDK

Official Python SDK for [RightOS](https://rightos.i-s3.com/software/rightos) — privacy-preserving rights verification infrastructure. Issue and verify digital QR tickets ("Right Tokens") for queues, reservations, EV charging, and package pickup, without ever collecting end users' names or phone numbers.

- Zero dependencies (standard library only), Python ≥ 3.9
- Machine-readable spec: [openapi.json](https://rightos.i-s3.com/openapi.json) · AI-agent docs: [llms-full.txt](https://rightos.i-s3.com/llms-full.txt)

**Links:** [Sign up free](https://rightos.i-s3.com/software/rightos/signup?plan=free) · [Pricing](https://rightos.i-s3.com/software/rightos/pricing) · [MCP setup](https://rightos.i-s3.com/software/rightos/docs/mcp) · [Use cases](https://rightos.i-s3.com/software/rightos/use-cases/shop) · [Usage insights](https://rightos.i-s3.com/software/rightos/insights)

> RightOS is not a taxi or ride-hailing service. It does not arrange vehicles, set fares, assign drivers, or broker dispatch.

## Install

```bash
pip install rightos-sdk
```

## Quickstart (60 seconds)

```python
from rightos import RightOS

# 1. Register once (the apiKey is returned EXACTLY ONCE — store it securely)
pub = RightOS()
reg = pub.register_organization(name="My Shop", contact_email="you@example.com", plan_id="free")
api_key = reg["apiKey"]

# 2. Operator client
client = RightOS(api_key=api_key)

# 3. Issue a digital QR ticket
location = client.list_locations()[0]
issued = client.issue_token(location_id=location["id"], title="Queue ticket")
print("Hand this to your customer:", issued["walletUrl"])

# 4. Verify on arrival (no API key needed)
outcome = RightOS().verify_token(issued["token"]["id"], issued["verificationCode"])
print(outcome["result"])  # "success"

# 5. Mark as used after service
client.use_token(issued["token"]["id"])
```

## Location policies (Policy Engine)

```python
policy = client.get_location_policy(location["id"])["policy"]
# {"transferable": True, "maxTransfers": 3, "defaultValidityMinutes": 720, ...}

client.set_location_policy(location["id"], {"transferable": False})  # override
client.set_location_policy(location["id"], None)  # reset to industry preset

# The full knowledge base — industry presets and country overlays
# (JP/US/GB/KR/TW/FR/DE/IT/ES/AU, informed by local ticket-resale laws):
defs = client.list_policies()  # defaults, not legal advice
```

## Webhooks (v0.4.0+)

Receive a signed HTTPS POST whenever a token is verified, used, cancelled, or transferred (up to 3 webhooks per organization):

```python
from rightos import RightOS, verify_webhook_signature

client = RightOS(api_key="rk_live_...")

# Register — the signing secret is returned EXACTLY ONCE
created = client.create_webhook(
    "https://example.com/rightos/hook",
    events=["token.verified", "token.used"],  # defaults to all four
)
secret = created["secret"]  # "whsec_..."

# In your receiver: verify the x-rightos-signature header against the RAW body
ok = verify_webhook_signature(secret, request.headers["x-rightos-signature"], raw_body)
# respond 2xx immediately; process asynchronously

client.list_webhooks()  # never includes secrets
client.delete_webhook(created["webhook"]["id"])
```

Delivery is best-effort (3s timeout, no retries). Signature format: `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, f"{t}.{raw_body}")>`.

## Error handling

```python
from rightos import RightOS, RightOSError

try:
    RightOS().transfer_token(token_id, code)
except RightOSError as e:
    if e.code == "policy_transfer_disabled":
        ...  # this location forbids transfers
    elif e.status == 429:
        ...  # rate limited; wait e.retry_after_sec
```

Common codes: `missing_api_key` / `invalid_api_key` (401), plan limits (402), `policy_transfer_disabled` / `transfer_limit_reached` (409), `rate_limited` (429).

## Try it against the live demo

```python
demo = RightOS(api_key="rk_demo_00000000000000000000")  # shared demo org
print(demo.list_locations())
```

## License

MIT © I-S3 Inc.
