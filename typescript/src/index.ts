/**
 * RightOS TypeScript SDK (zero-dependency, fetch-based).
 *
 * RightOS is privacy-preserving rights verification infrastructure:
 * digital QR tickets ("Right Tokens") for queues, reservations, EV charging,
 * and package pickup. It verifies that a valid right is present — never who
 * the person is.
 *
 * Works in Node.js >= 18 and modern browsers.
 * API reference: https://rightos.i-s3.com/openapi.json
 *
 * @example
 * ```ts
 * import { RightOS } from "@i-s3/rightos";
 *
 * const client = new RightOS({ apiKey: "rk_live_..." });
 * const issued = await client.issueToken({ locationId: "loc_...", title: "Queue ticket" });
 * // Hand issued.walletUrl (QR page) to your customer.
 * const outcome = await RightOS.verify(issued.token.id, issued.verificationCode);
 * ```
 */

export type PlanId = "free" | "starter" | "business" | "pro" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  nameEn: string;
  monthlyPrice: number | null;
  tokenLimit: number | null;
  locationLimit: number | null;
  apiEnabled: boolean;
  features: string[];
  featuresEn: string[];
}

export interface Organization {
  id: string;
  name: string;
  country: string;
  contactEmail: string;
  planId: PlanId;
  createdAt: string;
}

export interface Subscription {
  id: string;
  organizationId: string;
  planId: PlanId;
  status: "trialing" | "active" | "past_due" | "cancelled";
  startedAt: string;
  currentPeriodEnd: string;
}

export type LocationType =
  | "shop"
  | "clinic"
  | "ev_charging"
  | "event"
  | "logistics"
  | "pickup"
  | "other";

export interface RightLocation {
  id: string;
  organizationId: string;
  name: string;
  address: string;
  type: LocationType;
  timezone: string;
  active: boolean;
  policy?: Partial<RightPolicy>;
}

export interface RightPolicy {
  transferable: boolean;
  maxTransfers: number | null;
  defaultValidityMinutes: number;
  verificationRequirement: "none" | "external_id";
  /** Whether the current holder can self-cancel the token (Policy Phase 2). */
  holderCancellable: boolean;
}

/** Policy change audit record (append-only; contains no personal data). */
export interface PolicyChange {
  id: string;
  locationId: string;
  organizationId: string;
  /** Override in effect before the change (null = preset/overlay only). */
  before: Partial<RightPolicy> | null;
  /** Override in effect after the change (null = reset to preset). */
  after: Partial<RightPolicy> | null;
  createdAt: string;
}

export type RightTokenStatus =
  | "issued"
  | "verified"
  | "used"
  | "cancelled"
  | "expired";

export interface RightToken {
  id: string;
  organizationId: string;
  locationId: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  priorityNumber: number;
  status: RightTokenStatus;
  transferCount: number;
  createdAt: string;
  usedAt?: string;
  cancelledAt?: string;
  transferredAt?: string;
}

export type VerificationResult =
  | "success"
  | "failed"
  | "expired"
  | "cancelled"
  | "already_used";

export interface IssuedToken {
  token: RightToken;
  /** Returned exactly once. The server stores only its SHA-256 hash. */
  verificationCode: string;
  /** Right Wallet URL (QR page) to hand to the end user. */
  walletUrl: string;
}

export interface LocationPolicyResponse {
  locationId: string;
  locationType: LocationType;
  policy: RightPolicy;
  hasOverride: boolean;
}

/** Error thrown for any non-2xx API response. */
export class RightOSError extends Error {
  /** HTTP status code */
  readonly status: number;
  /** Machine-readable error code from the API (e.g. "invalid_api_key", "policy_transfer_disabled") */
  readonly code: string;
  /** Seconds to wait before retrying (present on 429) */
  readonly retryAfterSec?: number;

  constructor(status: number, code: string, retryAfterSec?: number) {
    super(`RightOS API error ${status}: ${code}`);
    this.name = "RightOSError";
    this.status = status;
    this.code = code;
    this.retryAfterSec = retryAfterSec;
  }
}

export interface RightOSOptions {
  /** API key (rk_live_...) issued once at organization registration. Omit for public endpoints only. */
  apiKey?: string;
  /** Base URL. Defaults to the production service. */
  baseUrl?: string;
  /** Custom fetch implementation (defaults to globalThis.fetch). */
  fetch?: typeof fetch;
}

export const DEFAULT_BASE_URL = "https://rightos.i-s3.com";

async function request<T>(
  options: Required<Pick<RightOSOptions, "baseUrl">> &
    Pick<RightOSOptions, "apiKey" | "fetch">,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const f = options.fetch ?? fetch;
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (options.apiKey) headers["x-rightos-key"] = options.apiKey;
  const res = await f(`${options.baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let code = "unknown_error";
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) code = data.error;
    } catch {
      // non-JSON error body
    }
    const retryAfter = res.headers.get("Retry-After");
    throw new RightOSError(
      res.status,
      code,
      retryAfter ? Number(retryAfter) : undefined
    );
  }
  return (await res.json()) as T;
}

/**
 * RightOS API client.
 *
 * - Operator methods require `apiKey`.
 * - Public methods (verify, transfer, getToken, getLocationPolicy, listPlans)
 *   are also available as static methods without a client instance.
 */
export class RightOS {
  private readonly opts: Required<Pick<RightOSOptions, "baseUrl">> &
    Pick<RightOSOptions, "apiKey" | "fetch">;

  constructor(options: RightOSOptions = {}) {
    this.opts = {
      baseUrl: options.baseUrl ?? DEFAULT_BASE_URL,
      apiKey: options.apiKey,
      fetch: options.fetch,
    };
  }

  // ---------- Public endpoints (no API key required) ----------

  /** List pricing plans (globally uniform pricing). */
  async listPlans(): Promise<Plan[]> {
    const data = await request<{ plans: Plan[] }>(this.opts, "GET", "/api/rightos/plans");
    return data.plans;
  }

  /** Get a Right Token (never includes the secret hash). */
  async getToken(tokenId: string): Promise<RightToken> {
    const data = await request<{ token: RightToken }>(
      this.opts,
      "GET",
      `/api/rightos/tokens/${encodeURIComponent(tokenId)}`
    );
    return data.token;
  }

  /**
   * Verify a Right Token by its verificationCode.
   * Rate limited: 10/min per IP+token, 60/min per IP.
   */
  async verifyToken(
    tokenId: string,
    verificationCode: string
  ): Promise<{ result: VerificationResult; token?: RightToken }> {
    return request(this.opts, "POST", `/api/rightos/tokens/${encodeURIComponent(tokenId)}/verify`, {
      verificationCode,
    });
  }

  /**
   * Transfer a right (re-keying). Only the current holder can transfer.
   * Subject to the location policy — throws RightOSError with code
   * "policy_transfer_disabled" or "transfer_limit_reached" (HTTP 409).
   */
  async transferToken(
    tokenId: string,
    currentVerificationCode: string
  ): Promise<IssuedToken> {
    return request(this.opts, "POST", `/api/rightos/tokens/${encodeURIComponent(tokenId)}/transfer`, {
      verificationCode: currentVerificationCode,
    });
  }

  /**
   * Self-cancel a token as its current holder (proven by the verificationCode).
   * Throws RightOSError with code "policy_cancel_disabled" (HTTP 409) when the
   * location's policy forbids holder self-cancellation. Rate limited like verify.
   */
  async holderCancelToken(
    tokenId: string,
    verificationCode: string
  ): Promise<RightToken> {
    const data = await request<{ token: RightToken }>(
      this.opts,
      "POST",
      `/api/rightos/tokens/${encodeURIComponent(tokenId)}/holder-cancel`,
      { verificationCode }
    );
    return data.token;
  }

  /** Get a location's effective policy (public, for transparency). */
  async getLocationPolicy(locationId: string): Promise<LocationPolicyResponse> {
    return request(
      this.opts,
      "GET",
      `/api/rightos/locations/${encodeURIComponent(locationId)}/policy`
    );
  }

  /**
   * Register an organization. The returned apiKey is shown EXACTLY ONCE —
   * store it securely. Rate limited: 5/hour per IP.
   */
  async registerOrganization(input: {
    name: string;
    contactEmail: string;
    planId: PlanId;
    country?: string;
  }): Promise<{ organization: Organization; subscription: Subscription; apiKey: string }> {
    return request(this.opts, "POST", "/api/rightos/organizations", input);
  }

  // ---------- Operator endpoints (API key required) ----------

  /** List your organization's locations. */
  async listLocations(): Promise<RightLocation[]> {
    const data = await request<{ locations: RightLocation[] }>(
      this.opts,
      "GET",
      "/api/rightos/locations"
    );
    return data.locations;
  }

  /** Create a location. Throws 402 when the plan's location limit is exceeded. */
  async createLocation(input: {
    name: string;
    address?: string;
    type?: LocationType;
    timezone?: string;
  }): Promise<RightLocation> {
    const data = await request<{ location: RightLocation }>(
      this.opts,
      "POST",
      "/api/rightos/locations",
      input
    );
    return data.location;
  }

  /**
   * Override a location's policy (partial update).
   * Pass null to reset to the industry preset.
   */
  async setLocationPolicy(
    locationId: string,
    patch: Partial<RightPolicy> | null
  ): Promise<LocationPolicyResponse> {
    return request(
      this.opts,
      "PUT",
      `/api/rightos/locations/${encodeURIComponent(locationId)}/policy`,
      patch
    );
  }

  /**
   * Policy change audit log for a location (own organization only).
   * Records are append-only and returned newest first.
   */
  async getLocationPolicyHistory(locationId: string): Promise<PolicyChange[]> {
    const data = await request<{ changes: PolicyChange[] }>(
      this.opts,
      "GET",
      `/api/rightos/locations/${encodeURIComponent(locationId)}/policy/history`
    );
    return data.changes;
  }

  /**
   * Issue a Right Token. The verificationCode and walletUrl are returned
   * exactly once — hand the walletUrl (QR page) to the end user.
   * Throws 402 when the plan's monthly token limit is exceeded.
   */
  async issueToken(input: {
    locationId: string;
    title: string;
    description?: string;
    startTime?: string;
    endTime?: string;
  }): Promise<IssuedToken> {
    return request(this.opts, "POST", "/api/rightos/tokens/issue", input);
  }

  /** Mark a token as used (own organization only). */
  async useToken(tokenId: string): Promise<RightToken> {
    const data = await request<{ token: RightToken }>(
      this.opts,
      "POST",
      `/api/rightos/tokens/${encodeURIComponent(tokenId)}/use`
    );
    return data.token;
  }

  /** Cancel a token (own organization only). */
  async cancelToken(tokenId: string): Promise<RightToken> {
    const data = await request<{ token: RightToken }>(
      this.opts,
      "POST",
      `/api/rightos/tokens/${encodeURIComponent(tokenId)}/cancel`
    );
    return data.token;
  }

  /** Export all organization data as JSON (no lock-in; contains no secrets). */
  async exportData(): Promise<unknown> {
    return request(this.opts, "GET", "/api/rightos/export");
  }

  /**
   * Re-issue the API key. The old key is invalidated immediately and the new
   * key is returned exactly once. Remember to update this client's options.
   */
  async rotateApiKey(): Promise<{ apiKey: string }> {
    return request(this.opts, "POST", "/api/rightos/organizations/rotate-key");
  }

  /**
   * Permanently delete the organization and all its data (irreversible).
   * `confirmName` must exactly match the organization name.
   */
  async deleteOrganization(confirmName: string): Promise<{ deleted: boolean }> {
    return request(this.opts, "POST", "/api/rightos/organizations/delete", {
      confirm: confirmName,
    });
  }

  // ---------- Static conveniences (public endpoints, default base URL) ----------

  /** Verify without constructing a client. */
  static verify(
    tokenId: string,
    verificationCode: string,
    baseUrl: string = DEFAULT_BASE_URL
  ): Promise<{ result: VerificationResult; token?: RightToken }> {
    return new RightOS({ baseUrl }).verifyToken(tokenId, verificationCode);
  }

  /** Transfer without constructing a client. */
  static transfer(
    tokenId: string,
    currentVerificationCode: string,
    baseUrl: string = DEFAULT_BASE_URL
  ): Promise<IssuedToken> {
    return new RightOS({ baseUrl }).transferToken(tokenId, currentVerificationCode);
  }

  /** Holder self-cancel without constructing a client. */
  static holderCancel(
    tokenId: string,
    verificationCode: string,
    baseUrl: string = DEFAULT_BASE_URL
  ): Promise<RightToken> {
    return new RightOS({ baseUrl }).holderCancelToken(tokenId, verificationCode);
  }
}
