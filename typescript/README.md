# @i-s3/rightos — RightOS TypeScript SDK

Official TypeScript SDK for [RightOS](https://rightos.i-s3.com/software/rightos) — privacy-preserving rights verification infrastructure. Issue and verify digital QR tickets ("Right Tokens") for queues, reservations, EV charging, and package pickup, without ever collecting end users' names or phone numbers.

- Zero dependencies (built on `fetch`), works in Node.js ≥ 18 and browsers
- Full TypeScript types for every endpoint
- Machine-readable spec: [openapi.json](https://rightos.i-s3.com/openapi.json) · AI-agent docs: [llms-full.txt](https://rightos.i-s3.com/llms-full.txt)

> RightOS is not a taxi or ride-hailing service. It does not arrange vehicles, set fares, assign drivers, or broker dispatch.

## Install

```bash
npm install @i-s3/rightos
```

## Quickstart (60 seconds)

```ts
import { RightOS } from "@i-s3/rightos";

// 1. Register once (the apiKey is returned EXACTLY ONCE — store it securely)
const pub = new RightOS();
const { organization, apiKey } = await pub.registerOrganization({
  name: "My Shop",
  contactEmail: "you@example.com",
  planId: "free",
});

// 2. Operator client
const client = new RightOS({ apiKey });

// 3. Issue a digital QR ticket
const [location] = await client.listLocations();
const issued = await client.issueToken({
  locationId: location.id,
  title: "Queue ticket",
});
console.log("Hand this to your customer:", issued.walletUrl);

// 4. Verify on arrival (no API key needed — e.g. from a kiosk or another system)
const outcome = await RightOS.verify(issued.token.id, issued.verificationCode);
console.log(outcome.result); // "success"

// 5. Mark as used after service
await client.useToken(issued.token.id);
```

## Location policies (Policy Engine)

Rules such as transferability are controlled per location, with industry presets (e.g. clinics and EV chargers are non-transferable by default):

```ts
const { policy } = await client.getLocationPolicy(location.id);
// { transferable: true, maxTransfers: 3, defaultValidityMinutes: 720, ... }

await client.setLocationPolicy(location.id, { transferable: false }); // override
await client.setLocationPolicy(location.id, null); // reset to industry preset

// The full knowledge base — industry presets and country overlays
// (JP/US/GB/KR/TW/FR/DE/IT/ES/AU, informed by local ticket-resale laws):
const defs = await client.listPolicies(); // defaults, not legal advice
```

## Webhooks (v0.4.0+)

Receive a signed HTTPS POST whenever a token is verified, used, cancelled, or transferred (up to 3 webhooks per organization):

```ts
// Register — the signing secret is returned EXACTLY ONCE
const { webhook, secret } = await client.createWebhook({
  url: "https://example.com/rightos/hook",
  events: ["token.verified", "token.used"], // defaults to all four
});

// In your receiver: verify the x-rightos-signature header against the RAW body
const ok = await RightOS.verifyWebhookSignature(
  secret,
  req.headers["x-rightos-signature"],
  rawBody // string, before JSON.parse
);
if (!ok) return res.status(400).end();
res.status(200).end(); // respond 2xx immediately; process asynchronously

await client.listWebhooks(); // never includes secrets
await client.deleteWebhook(webhook.id);
```

Delivery is best-effort (3s timeout, no retries). Signature format: `t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "${t}.${rawBody}")>`.

## Error handling

All non-2xx responses throw `RightOSError` with `status`, `code`, and `retryAfterSec` (on 429):

```ts
import { RightOSError } from "@i-s3/rightos";

try {
  await RightOS.transfer(tokenId, code);
} catch (e) {
  if (e instanceof RightOSError && e.code === "policy_transfer_disabled") {
    // this location forbids transfers
  }
}
```

Common codes: `missing_api_key` / `invalid_api_key` (401), plan limits (402), `policy_transfer_disabled` / `transfer_limit_reached` (409), `rate_limited` (429).

## Try it against the live demo

```ts
const demo = new RightOS({ apiKey: "rk_demo_00000000000000000000" }); // shared demo org
console.log(await demo.listLocations());
```

## License

MIT © I-S3 Inc.
