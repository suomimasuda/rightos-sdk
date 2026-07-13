# @i-s3/rightflow-mcp — RightFlow MCP Server

**Assignment is not authority.** RightOS answers **MAY**: what an actor may do. RightFlow answers **NEXT**: what should happen next. This MCP server exposes coordination tools without turning assignments into rights, payments, dispatch, or execution control.

MCP server for **RightFlow** (coordination), separate from [`@i-s3/rightos-mcp`](https://www.npmjs.com/package/@i-s3/rightos-mcp) (rights).

<!-- mcp-name: io.github.suomimasuda/rightflow-mcp -->

| Layer | Question | MCP package |
| --- | --- | --- |
| RightOS | What may be done? | `@i-s3/rightos-mcp` |
| RightFlow | What should happen next? | `@i-s3/rightflow-mcp` |
| Execution | How is it done? | your systems |

> Not a taxi/dispatch service. No price/bid/pay tools. Does not control robots or navigate.

## Setup (Cursor / Claude Desktop)

```json
{
  "mcpServers": {
    "rightflow": {
      "command": "npx",
      "args": ["-y", "@i-s3/rightflow-mcp"],
      "env": {
        "RIGHTOS_API_KEY": "rk_live_...",
        "RIGHTOS_BASE_URL": "https://rightos.i-s3.com"
      }
    }
  }
}
```

Local (from this repo, after `npm install && npm run build` in `sdk/rightflow` and `sdk/rightflow-mcp`):

```json
{
  "mcpServers": {
    "rightflow": {
      "command": "node",
      "args": ["products/rightos/sdk/rightflow-mcp/dist/index.js"],
      "env": {
        "RIGHTOS_API_KEY": "rk_demo_00000000000000000000",
        "RIGHTOS_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

`RIGHTOS_API_KEY` is required for all API tools. `explain_rightflow` works without it.

## Tools

| Tool | API key | Description |
| --- | --- | --- |
| `explain_rightflow` | no | Boundaries and non-goals |
| `upsert_actor` | yes | Upsert capabilities |
| `list_actors` / `get_actor` | yes | Actors |
| `create_task` / `list_tasks` / `get_task` | yes | FlowTasks |
| `apply_transition` | yes | start / progress / complete / fail / cancel |
| `create_proposal` / `list_proposals` | yes | assignment / reassignment / swap |
| `accept_proposal` / `reject_proposal` | yes | Resolve proposals |

## Example prompts

- "Explain RightFlow boundaries, then create a task requiring carry.light and assign it to actor_a."
- "Propose a swap between two assigned tasks — do not invent a bid tool."

## Resources

- https://www.npmjs.com/package/@i-s3/rightflow-mcp
- https://www.npmjs.com/package/@i-s3/rightflow
- https://rightos.i-s3.com/software/rightflow
- https://rightos.i-s3.com/rightflow-openapi.json
- https://rightos.i-s3.com/sdk/rightflow.ts

## License

MIT © I-S3 Inc.
