/**
 * RightFlow thin TypeScript client (zero-dependency, fetch-based).
 *
 * RightOS answers: What may this actor do?
 * RightFlow answers: What should happen next?
 * Your system answers: How will it actually be done?
 *
 * Same organization API key as RightOS. No bid/auction/pay endpoints.
 * Accept gates read RightOS tokens only — it does not verify/use/cancel/transfer.
 *
 * Single-file copy: https://rightos.i-s3.com/sdk/rightflow.ts
 * OpenAPI: https://rightos.i-s3.com/rightflow-openapi.json
 *
 * @example
 * ```ts
 * const rf = new RightFlow({ apiKey: "rk_live_..." });
 * await rf.upsertActor("actor_a", ["carry.light"]);
 * const { task } = await rf.createTask({
 *   title: "Move parcel",
 *   requiredCapabilities: ["carry.light"],
 * });
 * const { proposal } = await rf.createProposal({
 *   kind: "assignment",
 *   taskId: task.id,
 *   toActorId: "actor_a",
 * });
 * await rf.acceptProposal(proposal.id);
 * await rf.transition(task.id, "start");
 * ```
 */

export type FlowTaskState =
  | "open"
  | "assigned"
  | "in_progress"
  | "completed"
  | "failed"
  | "cancelled";

export type FlowProposalKind = "assignment" | "reassignment" | "swap";
export type FlowTransitionAction =
  | "start"
  | "progress"
  | "complete"
  | "fail"
  | "cancel";

export interface FlowActor {
  id: string;
  organizationId: string;
  capabilities: string[];
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FlowTask {
  id: string;
  organizationId: string;
  title: string;
  description?: string;
  state: FlowTaskState;
  requiredCapabilities: string[];
  requiredRights: string[];
  dependencyIds: string[];
  assignedActorId?: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  spatialRequirement?: Record<string, unknown>;
  progressPercent?: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface FlowProposal {
  id: string;
  organizationId: string;
  kind: FlowProposalKind;
  state: "proposed" | "accepted" | "rejected" | "invalidated";
  taskId?: string;
  toActorId?: string;
  fromActorId?: string;
  assignments?: Array<{
    taskId: string;
    fromActorId: string;
    toActorId: string;
  }>;
  createdAt: string;
  resolvedAt?: string;
}

export class RightFlowError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string
  ) {
    super(message ?? code);
    this.name = "RightFlowError";
  }
}

export interface RightFlowOptions {
  apiKey: string;
  /** Default: https://rightos.i-s3.com */
  baseUrl?: string;
  fetch?: typeof fetch;
}

export const DEFAULT_BASE_URL = "https://rightos.i-s3.com";

export class RightFlow {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;

  constructor(opts: RightFlowOptions) {
    if (!opts.apiKey) throw new Error("apiKey is required");
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.fetchFn = opts.fetch ?? fetch.bind(globalThis);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const res = await this.fetchFn(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    if (!res.ok) {
      throw new RightFlowError(
        res.status,
        data.error ?? "request_failed",
        data.message
      );
    }
    return data as T;
  }

  upsertActor(
    actorId: string,
    capabilities: string[],
    active?: boolean
  ): Promise<{ actor: FlowActor }> {
    return this.request("PUT", `/api/rightflow/actors/${encodeURIComponent(actorId)}`, {
      capabilities,
      active,
    });
  }

  listActors(): Promise<{ actors: FlowActor[] }> {
    return this.request("GET", "/api/rightflow/actors");
  }

  getActor(actorId: string): Promise<{ actor: FlowActor }> {
    return this.request(
      "GET",
      `/api/rightflow/actors/${encodeURIComponent(actorId)}`
    );
  }

  createTask(input: {
    title: string;
    description?: string;
    requiredCapabilities?: string[];
    requiredRights?: string[];
    dependencyIds?: string[];
    scheduledStartAt?: string;
    scheduledEndAt?: string;
    spatialRequirement?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<{ task: FlowTask }> {
    return this.request("POST", "/api/rightflow/tasks", input);
  }

  listTasks(filter?: {
    state?: string;
    actorId?: string;
  }): Promise<{ tasks: FlowTask[] }> {
    const q = new URLSearchParams();
    if (filter?.state) q.set("state", filter.state);
    if (filter?.actorId) q.set("actorId", filter.actorId);
    const qs = q.toString();
    return this.request(
      "GET",
      `/api/rightflow/tasks${qs ? `?${qs}` : ""}`
    );
  }

  getTask(taskId: string): Promise<{ task: FlowTask }> {
    return this.request(
      "GET",
      `/api/rightflow/tasks/${encodeURIComponent(taskId)}`
    );
  }

  transition(
    taskId: string,
    action: FlowTransitionAction,
    progressPercent?: number
  ): Promise<{ task: FlowTask }> {
    return this.request(
      "POST",
      `/api/rightflow/tasks/${encodeURIComponent(taskId)}/transitions`,
      { action, progressPercent }
    );
  }

  createProposal(input: {
    kind: FlowProposalKind;
    taskId?: string;
    toActorId?: string;
    fromActorId?: string;
    assignments?: [
      { taskId: string; fromActorId: string; toActorId: string },
      { taskId: string; fromActorId: string; toActorId: string },
    ];
  }): Promise<{ proposal: FlowProposal }> {
    return this.request("POST", "/api/rightflow/proposals", input);
  }

  listProposals(filter?: {
    taskId?: string;
    state?: string;
  }): Promise<{ proposals: FlowProposal[] }> {
    const q = new URLSearchParams();
    if (filter?.taskId) q.set("taskId", filter.taskId);
    if (filter?.state) q.set("state", filter.state);
    const qs = q.toString();
    return this.request(
      "GET",
      `/api/rightflow/proposals${qs ? `?${qs}` : ""}`
    );
  }

  acceptProposal(
    proposalId: string
  ): Promise<{ proposal: FlowProposal; tasks: FlowTask[] }> {
    return this.request(
      "POST",
      `/api/rightflow/proposals/${encodeURIComponent(proposalId)}/accept`
    );
  }

  rejectProposal(proposalId: string): Promise<{ proposal: FlowProposal }> {
    return this.request(
      "POST",
      `/api/rightflow/proposals/${encodeURIComponent(proposalId)}/reject`
    );
  }
}

export default RightFlow;
