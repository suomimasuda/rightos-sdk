#!/usr/bin/env node
/**
 * RightFlow MCP server (stdio transport).
 *
 * Separate from @i-s3/rightos-mcp. Rights stay in RightOS; this server only
 * exposes coordination (tasks, capabilities, proposals, execution state).
 *
 * Env:
 * - RIGHTOS_API_KEY  Organization API key (required for API tools)
 * - RIGHTOS_BASE_URL Override API base (default: production)
 *
 * Boundaries:
 * - Not a taxi/dispatch service
 * - No price/bid/pay/reward tools
 * - Does not navigate, control motors, or perform emergency stop
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { RightFlow, RightFlowError } from "@i-s3/rightflow";

const pkg = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "../package.json"),
    "utf8"
  )
) as { version: string };

const apiKey = process.env.RIGHTOS_API_KEY ?? "";
const baseUrl = process.env.RIGHTOS_BASE_URL;

function client(): RightFlow {
  if (!apiKey) {
    throw new RightFlowError(
      401,
      "missing_api_key",
      "Set RIGHTOS_API_KEY (same organization key as RightOS)."
    );
  }
  return new RightFlow({ apiKey, baseUrl });
}

const server = new McpServer({
  name: "rightflow",
  version: pkg.version,
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
    e instanceof RightFlowError
      ? JSON.stringify({
          error: e.code,
          httpStatus: e.status,
          message: e.message !== e.code ? e.message : undefined,
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

const BOUNDARIES = {
  principle: "Assignment is not authority.",
  rightos: "What may this actor do? (rights verification / MAY)",
  rightflow: "What should happen next? (coordination / NEXT)",
  execution: "How will it actually be done? (external systems / HOW)",
  pairing:
    "Use RightOS + RightFlow together for multi-agent reassignment under separately revocable rights. MCP (@i-s3/rightos-mcp, @i-s3/rightflow-mcp) for tools; A2A (or similar) for agent messaging — complements, not replacements. Do not collapse into one central agent.",
  does_not: [
    "vehicle dispatch / driver assignment / fare setting",
    "price, bid, auction, pay, reward, settlement",
    "navigation, SLAM, motor control, emergency stop",
    "redefining RightOS rights (read-only gate on accept only)",
    "minting authority by accepting a proposal",
  ],
  openapi: "https://rightos.i-s3.com/rightflow-openapi.json",
  concept: "https://rightos.i-s3.com/software/rightos/docs/concept",
  docs: "https://rightos.i-s3.com/software/rightflow/docs",
  note: "Accept proposal gates requiredRights via RightOS token read. Execution systems must re-verify RightOS before real action. Prefer capability matching over actor class (human/robot/AI). Hosted v0.1 is same-organization.",
};

server.registerTool(
  "explain_rightflow",
  {
    description:
      "Explain RightFlow boundaries in 30 seconds. No API key required. Use before coordinating tasks so you do not confuse rights, coordination, and execution — and do not invent bid/pay/dispatch tools.",
    inputSchema: {},
  },
  () => ok(BOUNDARIES)
);

server.registerTool(
  "upsert_actor",
  {
    description:
      "Upsert an actor's capabilities (capability strings only — no human/robot class). Requires RIGHTOS_API_KEY.",
    inputSchema: {
      actorId: z.string().describe("Stable actor id (e.g. actor_a)"),
      capabilities: z
        .array(z.string())
        .describe("Capability tokens, e.g. carry.light"),
      active: z.boolean().optional().describe("Default true"),
    },
  },
  ({ actorId, capabilities, active }) =>
    run(() => client().upsertActor(actorId, capabilities, active))
);

server.registerTool(
  "list_actors",
  {
    description: "List actors for the authenticated organization.",
    inputSchema: {},
  },
  () => run(() => client().listActors())
);

server.registerTool(
  "get_actor",
  {
    description: "Get one actor by id.",
    inputSchema: { actorId: z.string() },
  },
  ({ actorId }) => run(() => client().getActor(actorId))
);

server.registerTool(
  "create_task",
  {
    description:
      "Create a FlowTask in open state. Do not put price/bid/reward in metadata (rejected). requiredRights are RightOS token IDs for the accept gate.",
    inputSchema: {
      title: z.string(),
      description: z.string().optional(),
      requiredCapabilities: z.array(z.string()).optional(),
      requiredRights: z
        .array(z.string())
        .optional()
        .describe("RightOS token IDs"),
      dependencyIds: z.array(z.string()).optional(),
      scheduledStartAt: z.string().optional(),
      scheduledEndAt: z.string().optional(),
      spatialRequirement: z.record(z.unknown()).optional(),
      metadata: z.record(z.unknown()).optional(),
    },
  },
  (input) => run(() => client().createTask(input))
);

server.registerTool(
  "list_tasks",
  {
    description: "List FlowTasks (optional state / actorId filter).",
    inputSchema: {
      state: z.string().optional(),
      actorId: z.string().optional(),
    },
  },
  ({ state, actorId }) => run(() => client().listTasks({ state, actorId }))
);

server.registerTool(
  "get_task",
  {
    description: "Get a FlowTask by id.",
    inputSchema: { taskId: z.string() },
  },
  ({ taskId }) => run(() => client().getTask(taskId))
);

server.registerTool(
  "apply_transition",
  {
    description:
      "Apply execution-state transition: start | progress | complete | fail | cancel. start requires dependency tasks to be completed.",
    inputSchema: {
      taskId: z.string(),
      action: z.enum(["start", "progress", "complete", "fail", "cancel"]),
      progressPercent: z.number().min(0).max(100).optional(),
    },
  },
  ({ taskId, action, progressPercent }) =>
    run(() => client().transition(taskId, action, progressPercent))
);

server.registerTool(
  "create_proposal",
  {
    description:
      "Propose assignment, reassignment, or swap. Neutral coordination language only — there is no bid/auction tool.",
    inputSchema: {
      kind: z.enum(["assignment", "reassignment", "swap"]),
      taskId: z.string().optional(),
      toActorId: z.string().optional(),
      fromActorId: z.string().optional(),
      assignments: z
        .array(
          z.object({
            taskId: z.string(),
            fromActorId: z.string(),
            toActorId: z.string(),
          })
        )
        .length(2)
        .optional()
        .describe("Required for kind=swap (exactly two legs)"),
    },
  },
  (input) =>
    run(() =>
      client().createProposal({
        kind: input.kind,
        taskId: input.taskId,
        toActorId: input.toActorId,
        fromActorId: input.fromActorId,
        assignments: input.assignments as
          | [
              { taskId: string; fromActorId: string; toActorId: string },
              { taskId: string; fromActorId: string; toActorId: string },
            ]
          | undefined,
      })
    )
);

server.registerTool(
  "list_proposals",
  {
    description: "List proposals (optional taskId / state filter).",
    inputSchema: {
      taskId: z.string().optional(),
      state: z.string().optional(),
    },
  },
  ({ taskId, state }) => run(() => client().listProposals({ taskId, state }))
);

server.registerTool(
  "accept_proposal",
  {
    description:
      "Accept a proposal after capability + RightOS requiredRights read gate. Does not verify/use/cancel/transfer RightOS tokens.",
    inputSchema: { proposalId: z.string() },
  },
  ({ proposalId }) => run(() => client().acceptProposal(proposalId))
);

server.registerTool(
  "reject_proposal",
  {
    description: "Reject a proposed assignment/reassignment/swap.",
    inputSchema: { proposalId: z.string() },
  },
  ({ proposalId }) => run(() => client().rejectProposal(proposalId))
);

const transport = new StdioServerTransport();
await server.connect(transport);
