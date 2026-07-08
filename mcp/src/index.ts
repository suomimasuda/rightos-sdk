#!/usr/bin/env node
/**
 * RightOS MCP server (stdio transport).
 *
 * Exposes the RightOS Right API as MCP tools so AI agents can issue, verify,
 * transfer, and manage digital QR tickets ("Right Tokens") without writing
 * HTTP code.
 *
 * Configuration (environment variables):
 * - RIGHTOS_API_KEY  Operator API key (rk_live_...). Optional — without it,
 *                    only public tools (plans, token lookup, verify, transfer,
 *                    location policy) are usable.
 * - RIGHTOS_BASE_URL Override the API base URL (default: production).
 *
 * RightOS is not a taxi or ride-hailing service. It does not arrange
 * vehicles, set fares, assign drivers, or broker dispatch.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { RightOS, RightOSError } from "@i-s3/rightos";

const client = new RightOS({
  apiKey: process.env.RIGHTOS_API_KEY,
  baseUrl: process.env.RIGHTOS_BASE_URL,
});

const server = new McpServer({
  name: "rightos",
  version: "0.4.0",
});

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

function ok(data: unknown): ToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(e: unknown): ToolResult {
  const text =
    e instanceof RightOSError
      ? JSON.stringify({
          error: e.code,
          httpStatus: e.status,
          retryAfterSec: e.retryAfterSec,
        })
      : String(e);
  return { content: [{ type: "text", text }], isError: true };
}

async function run(fn: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await fn());
  } catch (e) {
    return err(e);
  }
}

// ---------- Public tools (no API key required) ----------

server.registerTool(
  "list_plans",
  {
    description:
      "List RightOS pricing plans (globally uniform pricing, free tier available).",
    inputSchema: {},
  },
  () => run(() => client.listPlans())
);

server.registerTool(
  "get_token",
  {
    description:
      "Get a Right Token (digital QR ticket) by its tokenId. Never returns the secret verification code.",
    inputSchema: { tokenId: z.string().describe("Token ID (tok_...)") },
  },
  ({ tokenId }) => run(() => client.getToken(tokenId))
);

server.registerTool(
  "verify_token",
  {
    description:
      "Verify a Right Token with its verification code. Result is success / failed / expired / cancelled / already_used. Rate limited (10/min per token).",
    inputSchema: {
      tokenId: z.string().describe("Token ID (tok_...)"),
      verificationCode: z.string().describe("The holder's verification code"),
    },
  },
  ({ tokenId, verificationCode }) =>
    run(() => client.verifyToken(tokenId, verificationCode))
);

server.registerTool(
  "transfer_token",
  {
    description:
      "Transfer a Right Token to a new holder (re-keying: a new verification code is issued and the old one is invalidated immediately). Only the current holder can transfer. May be rejected by the location's policy (policy_transfer_disabled / transfer_limit_reached).",
    inputSchema: {
      tokenId: z.string().describe("Token ID (tok_...)"),
      verificationCode: z
        .string()
        .describe("Current verification code, proving transfer authority"),
    },
  },
  ({ tokenId, verificationCode }) =>
    run(() => client.transferToken(tokenId, verificationCode))
);

server.registerTool(
  "holder_cancel_token",
  {
    description:
      "Self-cancel a Right Token as its current holder (proven by the verification code). May be rejected by the location's policy (policy_cancel_disabled). Irreversible. Rate limited like verify.",
    inputSchema: {
      tokenId: z.string().describe("Token ID (tok_...)"),
      verificationCode: z
        .string()
        .describe("Current verification code, proving holder authority"),
    },
  },
  ({ tokenId, verificationCode }) =>
    run(() => client.holderCancelToken(tokenId, verificationCode))
);

server.registerTool(
  "get_location_policy",
  {
    description:
      "Get a location's effective policy (transferability, max transfers, default validity, holder self-cancellation). Resolution: industry preset -> country overlay -> location override. Public for transparency.",
    inputSchema: { locationId: z.string().describe("Location ID (loc_...)") },
  },
  ({ locationId }) => run(() => client.getLocationPolicy(locationId))
);

server.registerTool(
  "list_policies",
  {
    description:
      "List the full policy knowledge base: industry presets per location type and country overlays (JP, US, GB, KR, TW, FR, DE, IT, ES, AU — informed by local ticket-resale laws). Useful when choosing a location type or proposing policy overrides. Defaults, not legal advice. Public.",
    inputSchema: {},
  },
  () => run(() => client.listPolicies())
);

// ---------- Operator tools (require RIGHTOS_API_KEY) ----------

const NEEDS_KEY =
  " Requires the RIGHTOS_API_KEY environment variable (operator API key).";

server.registerTool(
  "list_locations",
  {
    description: "List your organization's locations." + NEEDS_KEY,
    inputSchema: {},
  },
  () => run(() => client.listLocations())
);

server.registerTool(
  "create_location",
  {
    description:
      "Create a location (shop, clinic, ev_charging, event, logistics, pickup, other). Returns 402 if the plan's location limit is exceeded." +
      NEEDS_KEY,
    inputSchema: {
      name: z.string().describe("Location name"),
      address: z.string().optional().describe("Address (optional)"),
      type: z
        .enum([
          "shop",
          "clinic",
          "ev_charging",
          "event",
          "logistics",
          "pickup",
          "other",
        ])
        .optional()
        .describe("Location type (determines the industry policy preset)"),
      timezone: z.string().optional().describe("IANA timezone, e.g. Asia/Tokyo"),
    },
  },
  (input) => run(() => client.createLocation(input))
);

server.registerTool(
  "set_location_policy",
  {
    description:
      "Override a location's policy (partial update: transferable, maxTransfers, defaultValidityMinutes, verificationRequirement). Set reset=true to restore the industry preset." +
      NEEDS_KEY,
    inputSchema: {
      locationId: z.string().describe("Location ID (loc_...)"),
      reset: z
        .boolean()
        .optional()
        .describe("true = reset to the industry preset (ignores other fields)"),
      transferable: z.boolean().optional(),
      maxTransfers: z
        .number()
        .int()
        .min(0)
        .max(1000)
        .nullable()
        .optional()
        .describe("Max transfers; null = unlimited"),
      defaultValidityMinutes: z.number().int().min(5).max(43200).optional(),
      verificationRequirement: z.enum(["none", "external_id"]).optional(),
      holderCancellable: z
        .boolean()
        .optional()
        .describe("Whether the current holder can self-cancel the token"),
    },
  },
  ({ locationId, reset, ...patch }) =>
    run(() =>
      client.setLocationPolicy(
        locationId,
        reset
          ? null
          : Object.fromEntries(
              Object.entries(patch).filter(([, v]) => v !== undefined)
            )
      )
    )
);

server.registerTool(
  "issue_token",
  {
    description:
      "Issue a Right Token (digital QR ticket). The verification code and wallet URL are returned EXACTLY ONCE — hand the walletUrl to the end user. Returns 402 if the plan's monthly limit is exceeded." +
      NEEDS_KEY,
    inputSchema: {
      locationId: z.string().describe("Location ID (loc_...)"),
      title: z.string().describe("Ticket title, e.g. 'Queue ticket'"),
      description: z.string().optional(),
      startTime: z.string().optional().describe("ISO 8601 start time"),
      endTime: z
        .string()
        .optional()
        .describe(
          "ISO 8601 expiry; defaults to the location policy's default validity"
        ),
    },
  },
  (input) => run(() => client.issueToken(input))
);

server.registerTool(
  "use_token",
  {
    description:
      "Mark a Right Token as used after service (own organization only)." +
      NEEDS_KEY,
    inputSchema: { tokenId: z.string().describe("Token ID (tok_...)") },
  },
  ({ tokenId }) => run(() => client.useToken(tokenId))
);

server.registerTool(
  "cancel_token",
  {
    description:
      "Cancel a Right Token (own organization only)." + NEEDS_KEY,
    inputSchema: { tokenId: z.string().describe("Token ID (tok_...)") },
  },
  ({ tokenId }) => run(() => client.cancelToken(tokenId))
);

server.registerTool(
  "get_policy_history",
  {
    description:
      "Policy change audit log for a location (before/after overrides, newest first). Append-only." +
      NEEDS_KEY,
    inputSchema: { locationId: z.string().describe("Location ID (loc_...)") },
  },
  ({ locationId }) => run(() => client.getLocationPolicyHistory(locationId))
);

server.registerTool(
  "export_data",
  {
    description:
      "Export all organization data (locations, tokens, verification logs, policy change history) as JSON. Contains no secret values." +
      NEEDS_KEY,
    inputSchema: {},
  },
  () => run(() => client.exportData())
);

server.registerTool(
  "list_webhooks",
  {
    description:
      "List the organization's outbound webhooks (never includes signing secrets)." +
      NEEDS_KEY,
    inputSchema: {},
  },
  () => run(() => client.listWebhooks())
);

server.registerTool(
  "create_webhook",
  {
    description:
      "Register an outbound webhook (up to 3 per organization, https only). Events: token.verified / token.used / token.cancelled / token.transferred (defaults to all). The response includes the signing secret (whsec_...) EXACTLY ONCE — deliveries are signed via the x-rightos-signature header (t=<unix seconds>,v1=<hex HMAC-SHA256>)." +
      NEEDS_KEY,
    inputSchema: {
      url: z.string().describe("https URL to receive signed POST deliveries"),
      events: z
        .array(
          z.enum([
            "token.verified",
            "token.used",
            "token.cancelled",
            "token.transferred",
          ])
        )
        .optional()
        .describe("Event types to subscribe to (defaults to all four)"),
    },
  },
  ({ url, events }) => run(() => client.createWebhook({ url, events }))
);

server.registerTool(
  "delete_webhook",
  {
    description: "Delete an outbound webhook (own organization only)." + NEEDS_KEY,
    inputSchema: { webhookId: z.string().describe("Webhook ID (wh_...)") },
  },
  ({ webhookId }) => run(() => client.deleteWebhook(webhookId))
);

const transport = new StdioServerTransport();
await server.connect(transport);
