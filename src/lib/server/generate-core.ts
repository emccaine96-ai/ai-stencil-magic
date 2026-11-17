// src/lib/server/generate-core.ts
/**
 * Pure decision logic for one cloud generation: consent, rate limits, global budget, model allowlist, credit reservation,
 * the provider call, and settle-or-refund. All I/O is injected, so every money path can be tested with fakes.
 *
 * Invariants:
 *  - Order of checks: consent, per-user limits, global budget, model allowlist, then reserve. Nothing is reserved before them.
 *  - If reserve says the request was already reserved, return duplicate_request and DO NOT call the provider.
 *  - After a successful reserve, everything runs inside one try/finally. `settled` becomes true only after the provider
 *    succeeded AND settle() succeeded. The finally block refunds whenever it is false, so a refund cannot be skipped by a
 *    provider error, a timeout, a malformed response, or a failure of settle() itself.
 *  - Upstream error text is logged (truncated) and never returned to the caller.
 */

export type GenerateCode =
  | "consent_required"
  | "rate_limited_minute"
  | "rate_limited_day"
  | "busy"
  | "insufficient_credits"
  | "duplicate_request"
  | "provider_error"
  | "timeout"
  | "invalid_model";

export type GenerateResult =
  | { ok: true; image: string; balance: number }
  | { ok: false; code: GenerateCode };

export interface ReserveResult {
  already_reserved?: boolean;
  balance?: number;
}

/** Thrown by deps.reserve when the user cannot afford the cost. */
export class InsufficientCreditsError extends Error {
  constructor() {
    super("insufficient_credits");
    this.name = "InsufficientCreditsError";
  }
}

/** Thrown by deps.callProvider when the upstream call exceeded the timeout (the AbortController fired). */
export class ProviderTimeoutError extends Error {
  constructor() {
    super("provider_timeout");
    this.name = "ProviderTimeoutError";
  }
}

export interface GenerateDeps {
  now: () => Date;
  /** True when the user has recorded consent for the current consent version. */
  hasConsent: (userId: string) => Promise<boolean>;
  /** Number of the user's requests (ALL statuses, refunded included) created at or after `since`. */
  countUser: (userId: string, since: Date) => Promise<number>;
  /** Sum of cost of requests with status reserved or done created at or after `since` (all users). */
  sumGlobal: (since: Date) => Promise<number>;
  reserve: (p: { userId: string; requestId: string; cost: number; model: string; provider: string }) => Promise<ReserveResult>;
  settle: (requestId: string) => Promise<void>;
  refund: (requestId: string) => Promise<void>;
  balance: (userId: string) => Promise<number>;
  /** Calls the AI provider. Must reject with ProviderTimeoutError on timeout. `signal` is aborted when the timeout fires. */
  callProvider: (p: { model: string; signal: AbortSignal }) => Promise<string>;
  log: (message: string, detail?: unknown) => void;
}

export interface GenerateConfig {
  provider: string;
  model: string;
  modelAllowlist: readonly string[];
  cost: number;
  perMinuteLimit: number;
  perDayLimit: number;
  dailyBudget: number;
  timeoutMs: number;
}

export interface GenerateInput {
  userId: string;
  requestId: string;
  /** Model the caller wants. Anything outside the allowlist is rejected, never forwarded. */
  model?: string;
}

/** Start of the current UTC day. */
export function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const truncate = (v: unknown, n = 300) => String((v as { message?: string })?.message ?? v).slice(0, n);

export async function generate(input: GenerateInput, cfg: GenerateConfig, deps: GenerateDeps): Promise<GenerateResult> {
  const { userId, requestId } = input;
  const model = input.model ?? cfg.model;

  // 1. consent
  if (!(await deps.hasConsent(userId))) return { ok: false, code: "consent_required" };

  // 2. per-user limits (every status counts, so failed or refunded attempts still count)
  const now = deps.now();
  const minuteAgo = new Date(now.getTime() - 60_000);
  if ((await deps.countUser(userId, minuteAgo)) >= cfg.perMinuteLimit) return { ok: false, code: "rate_limited_minute" };
  const dayStart = utcMidnight(now);
  if ((await deps.countUser(userId, dayStart)) >= cfg.perDayLimit) return { ok: false, code: "rate_limited_day" };

  // 3. global daily budget
  if ((await deps.sumGlobal(dayStart)) >= cfg.dailyBudget) return { ok: false, code: "busy" };

  // 4. model allowlist
  if (!cfg.modelAllowlist.includes(model)) return { ok: false, code: "invalid_model" };

  // 5. reserve credits
  let reserved: ReserveResult;
  try {
    reserved = await deps.reserve({ userId, requestId, cost: cfg.cost, model, provider: cfg.provider });
  } catch (e) {
    if (e instanceof InsufficientCreditsError || (e as { message?: string })?.message?.includes("insufficient_credits")) {
      return { ok: false, code: "insufficient_credits" };
    }
    deps.log("[generate] reserve failed", truncate(e));
    return { ok: false, code: "provider_error" };
  }
  if (reserved?.already_reserved) return { ok: false, code: "duplicate_request" };

  // 6. provider call, then settle. The finally block is the refund guarantee.
  let settled = false;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new ProviderTimeoutError());
      }, cfg.timeoutMs);
    });
    const image = await Promise.race([deps.callProvider({ model, signal: controller.signal }), timeout]);
    if (typeof image !== "string" || image.length === 0) throw new Error("empty provider image");
    await deps.settle(requestId);
    settled = true;
    const balance = await deps.balance(userId).catch(() => reserved?.balance ?? 0);
    return { ok: true, image, balance };
  } catch (e) {
    if (e instanceof ProviderTimeoutError) {
      deps.log("[generate] provider timeout", `${cfg.timeoutMs}ms`);
      return { ok: false, code: "timeout" };
    }
    deps.log("[generate] provider/settle failed", truncate(e));
    return { ok: false, code: "provider_error" };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (!settled) {
      try {
        await deps.refund(requestId);
      } catch (e) {
        // A failed refund must be loud: the user was charged and got nothing. It is logged for manual repair.
        deps.log("[generate] REFUND FAILED, manual repair needed", `request ${requestId}: ${truncate(e)}`);
      }
    }
  }
}
