# RightOS SDKs

[![ci](https://github.com/suomimasuda/rightos-sdk/actions/workflows/ci.yml/badge.svg)](https://github.com/suomimasuda/rightos-sdk/actions/workflows/ci.yml)

Official SDKs for [RightOS](https://rightos.i-s3.com/software/rightos) — privacy-preserving rights verification infrastructure by [I-S3](https://www.i-s3.com/) (Japan).

RightOS turns queues, reservations, EV charging, and package pickup into digital QR tickets ("Right Tokens"). It verifies that **a valid right is present — never who the person is**. No names, phone numbers, or birthdates are required from end users.

> RightOS is not a taxi or ride-hailing service. It does not arrange vehicles, set fares, assign drivers, or broker dispatch.

## SDKs

| Layer | Question | Packages |
|---|---|---|
| RightOS | What may be done? | [`@i-s3/rightos`](https://www.npmjs.com/package/@i-s3/rightos) · [`@i-s3/rightos-mcp`](https://www.npmjs.com/package/@i-s3/rightos-mcp) |
| RightFlow | What should happen next? | [`@i-s3/rightflow`](https://www.npmjs.com/package/@i-s3/rightflow) · [`@i-s3/rightflow-mcp`](https://www.npmjs.com/package/@i-s3/rightflow-mcp) |
| Execution | How is it done? | your systems |

RightOS / RightFlow SDKs install via package managers (or download the thin client files).

| Language | Package | Single file | Requirements |
|---|---|---|---|
| TypeScript | [`typescript/`](./typescript) — [`@i-s3/rightos`](https://www.npmjs.com/package/@i-s3/rightos) | [rightos.ts](https://rightos.i-s3.com/sdk/rightos.ts) | Node.js ≥ 18 or a modern browser |
| Python | [`python/`](./python) — [`rightos-sdk`](https://pypi.org/project/rightos-sdk/) | [rightos.py](https://rightos.i-s3.com/sdk/rightos.py) | Python ≥ 3.9, standard library only |
| TypeScript | [`rightflow/`](./rightflow) — [`@i-s3/rightflow`](https://www.npmjs.com/package/@i-s3/rightflow) | [rightflow.ts](https://rightos.i-s3.com/sdk/rightflow.ts) | Node.js ≥ 18 or a modern browser |

> RightFlow is coordination beside RightOS — not a redesign. No money, marketplace, dispatch, or robot control in the core.

## MCP servers (for AI agents)

[`mcp/`](./mcp) — `@i-s3/rightos-mcp`: rights tools (issue / verify / transfer).

[`rightflow-mcp/`](./rightflow-mcp) — `@i-s3/rightflow-mcp`: coordination tools (tasks / actors / proposals / transitions). Separate from RightOS MCP.

```json
{
  "mcpServers": {
    "rightos": {
      "command": "npx",
      "args": ["-y", "@i-s3/rightos-mcp"],
      "env": { "RIGHTOS_API_KEY": "rk_live_..." }
    },
    "rightflow": {
      "command": "npx",
      "args": ["-y", "@i-s3/rightflow-mcp"],
      "env": { "RIGHTOS_API_KEY": "rk_live_..." }
    }
  }
}
```

## Quick example (TypeScript)

```ts
import { RightOS } from "@i-s3/rightos";

const client = new RightOS({ apiKey: "rk_live_..." });
const [location] = await client.listLocations();
const issued = await client.issueToken({ locationId: location.id, title: "Queue ticket" });
// Hand issued.walletUrl (QR page) to your customer
const outcome = await RightOS.verify(issued.token.id, issued.verificationCode);
// outcome.result === "success"
```

## Quick example (Python)

```python
from rightos import RightOS

client = RightOS(api_key="rk_live_...")
location = client.list_locations()[0]
issued = client.issue_token(location_id=location["id"], title="Queue ticket")
outcome = RightOS().verify_token(issued["token"]["id"], issued["verificationCode"])
# outcome["result"] == "success"
```

## Resources

- [RightOS docs](https://rightos.i-s3.com/software/rightos/docs)
- [RightFlow docs](https://rightos.i-s3.com/software/rightflow/docs)
- [OpenAPI 3.1 (RightOS)](https://rightos.i-s3.com/openapi.json)
- [OpenAPI (RightFlow)](https://rightos.i-s3.com/rightflow-openapi.json)
- [Full documentation for AI agents (llms-full.txt)](https://rightos.i-s3.com/llms-full.txt)
- [Pricing](https://rightos.i-s3.com/software/rightos/pricing) — globally uniform, free tier available, no credit card required
- Try the live demo without registration: shared demo key `rk_demo_00000000000000000000`

## Privacy & security design

- The verification code is handed to the holder exactly once; the server stores only its SHA-256 hash.
- Transfers use re-keying: a new code is issued and the old one is invalidated immediately.
- QR codes contain only the `tokenId` and `verificationCode` — no personal data.
- Paid transfers and auctions are not offered.

## License

MIT © I-S3 Inc.
