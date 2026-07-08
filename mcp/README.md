# @i-s3/rightos-mcp — RightOS MCP Server

[MCP (Model Context Protocol)](https://modelcontextprotocol.io/) server for [RightOS](https://rightos.i-s3.com/software/rightos) — lets AI agents issue, verify, and transfer digital QR tickets ("Right Tokens") for queues, reservations, EV charging, and package pickup, without writing HTTP code.

RightOS verifies that **a valid right is present — never who the person is**. No names, phone numbers, or birthdates are required from end users.

> RightOS is not a taxi or ride-hailing service. It does not arrange vehicles, set fares, assign drivers, or broker dispatch.

## Setup

Add to your MCP client configuration (Cursor, Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "rightos": {
      "command": "npx",
      "args": ["-y", "@i-s3/rightos-mcp"],
      "env": {
        "RIGHTOS_API_KEY": "rk_live_..."
      }
    }
  }
}
```

`RIGHTOS_API_KEY` is optional. Without it, only the public tools work (plans, token lookup, verify, transfer, location policy). Get a key by [registering an organization](https://rightos.i-s3.com/software/rightos/signup) — free tier, no credit card.

To try it with the shared demo organization, set `RIGHTOS_API_KEY` to `rk_demo_00000000000000000000`.

## Tools

Public (no API key):

| Tool | Description |
|---|---|
| `list_plans` | List pricing plans (globally uniform) |
| `get_token` | Get a Right Token by ID (never returns the secret code) |
| `verify_token` | Verify a token with its verification code |
| `transfer_token` | Transfer a token via re-keying (old code invalidated) |
| `holder_cancel_token` | Self-cancel a token as its current holder (policy permitting) |
| `get_location_policy` | Get a location's effective policy (public for transparency) |
| `list_policies` | List all industry presets and country overlays (JP/US/GB/KR/TW/FR/DE/IT/ES/AU) |

Operator (requires `RIGHTOS_API_KEY`):

| Tool | Description |
|---|---|
| `list_locations` | List your organization's locations |
| `create_location` | Create a location (type determines the industry policy preset) |
| `set_location_policy` | Override or reset a location's policy |
| `get_policy_history` | Policy change audit log (append-only, newest first) |
| `issue_token` | Issue a digital QR ticket (code + wallet URL returned exactly once) |
| `use_token` | Mark a ticket as used after service |
| `cancel_token` | Cancel a ticket |
| `export_data` | Export all organization data as JSON (no lock-in) |

## Example prompts

- "Issue a queue ticket for my main counter and give me the wallet URL."
- "Verify this ticket: tok_... with code K7MP-..."
- "Make my EV charging location non-transferable." (it already is, by industry preset — the agent can check with `get_location_policy`)

## Resources

- [Developer documentation](https://rightos.i-s3.com/software/rightos/docs)
- [OpenAPI 3.1 specification](https://rightos.i-s3.com/openapi.json)
- [Full documentation for AI agents (llms-full.txt)](https://rightos.i-s3.com/llms-full.txt)
- [TypeScript SDK `@i-s3/rightos`](https://www.npmjs.com/package/@i-s3/rightos) · [Python SDK `rightos-sdk`](https://pypi.org/project/rightos-sdk/)

## License

MIT © I-S3 Inc.
