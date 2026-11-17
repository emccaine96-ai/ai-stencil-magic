import { expect, test } from "bun:test";
import {
  generate,
  utcMidnight,
  InsufficientCreditsError,
  ProviderTimeoutError,
  type GenerateConfig,
  type GenerateDeps,
} from "./generate-core";

const CFG: GenerateConfig = {
  provider: "openrouter",
  model: "google/gemini-2.5-flash-image",
  modelAllowlist: ["google/gemini-2.5-flash-image"],
  cost: 1,
  perMinuteLimit: 6,
  perDayLimit: 100,
  dailyBudget: 300,
  timeoutMs: 50,
};

type Row = { userId: string; requestId: string; cost: number; status: "reserved" | "done" | "refunded"; createdAt: Date };

/** A fake backend that behaves like the database: a ledger, request rows, per-request idempotency, refund only on 'reserved'. */
function makeWorld(opts: { balance?: number; consent?: boolean; now?: Date; provider?: GenerateDeps["callProvider"] } = {}) {
  const w = {
    balance: opts.balance ?? 3,
    consent: opts.consent ?? true,
    now: opts.now ?? new Date("2026-11-17T15:00:00Z"),
    rows: [] as Row[],
    calls: { provider: 0, reserve: 0, settle: 0, refund: 0, logs: [] as string[] },
    seedRows(userId: string, n: number, at: Date, status: Row["status"] = "done") {
      for (let i = 0; i < n; i++) w.rows.push({ userId, requestId: `seed-${userId}-${w.rows.length}`, cost: 1, status, createdAt: at });
    },
  };
  const deps: GenerateDeps = {
    now: () => w.now,
    hasConsent: async () => w.consent,
    countUser: async (userId, since) => w.rows.filter((r) => r.userId === userId && r.createdAt >= since).length,
    sumGlobal: async (since) => w.rows.filter((r) => r.createdAt >= since && (r.status === "reserved" || r.status === "done")).reduce((a, r) => a + r.cost, 0),
    reserve: async ({ userId, requestId, cost }) => {
      w.calls.reserve++;
      if (w.rows.some((r) => r.requestId === requestId)) return { already_reserved: true, balance: w.balance };
      if (w.balance < cost) throw new InsufficientCreditsError();
      w.balance -= cost;
      w.rows.push({ userId, requestId, cost, status: "reserved", createdAt: w.now });
      return { already_reserved: false, balance: w.balance };
    },
    settle: async (requestId) => {
      w.calls.settle++;
      const r = w.rows.find((x) => x.requestId === requestId);
      if (r && r.status === "reserved") r.status = "done";
    },
    refund: async (requestId) => {
      w.calls.refund++;
      const r = w.rows.find((x) => x.requestId === requestId);
      if (r && r.status === "reserved") {
        r.status = "refunded";
        w.balance += r.cost;
      }
    },
    balance: async () => w.balance,
    callProvider: opts.provider ?? (async () => { w.calls.provider++; return "data:image/png;base64,AAAA"; }),
    log: (m, d) => w.calls.logs.push(`${m} ${d ?? ""}`),
  };
  return { w, deps };
}
const input = (requestId = "req-1", userId = "user-1") => ({ userId, requestId });

test("happy path: charges 1 credit, settles once, returns the image and the new balance", async () => {
  const { w, deps } = makeWorld({ balance: 3 });
  const r = await generate(input(), CFG, deps);
  expect(r).toEqual({ ok: true, image: "data:image/png;base64,AAAA", balance: 2 });
  expect(w.calls.provider).toBe(1);
  expect(w.calls.settle).toBe(1);
  expect(w.calls.refund).toBe(0);
  expect(w.rows[0].status).toBe("done");
});

test("provider throws: exactly one refund, no settle, balance restored, error text not returned", async () => {
  const { w, deps } = makeWorld({ provider: async () => { throw new Error("upstream said: sk-or-SECRET-key-leak 500"); } });
  const r = await generate(input(), CFG, deps);
  expect(r).toEqual({ ok: false, code: "provider_error" });
  expect(w.calls.refund).toBe(1);
  expect(w.calls.settle).toBe(0);
  expect(w.balance).toBe(3);
  expect(w.rows[0].status).toBe("refunded");
  expect(JSON.stringify(r)).not.toContain("SECRET");
  expect(w.calls.logs.join(" ")).toContain("SECRET"); // logged server-side only
});

test("upstream error text is truncated in the log", async () => {
  const { w, deps } = makeWorld({ provider: async () => { throw new Error("x".repeat(5000)); } });
  await generate(input(), CFG, deps);
  expect(w.calls.logs.join("").length).toBeLessThan(600);
});

test("timeout: exactly one refund, the abort signal fires, code is timeout", async () => {
  let aborted = false;
  const { w, deps } = makeWorld({
    provider: ({ signal }) => new Promise((_, reject) => { signal.addEventListener("abort", () => { aborted = true; reject(new ProviderTimeoutError()); }); }),
  });
  const r = await generate(input(), CFG, deps);
  expect(r).toEqual({ ok: false, code: "timeout" });
  expect(aborted).toBe(true);
  expect(w.calls.refund).toBe(1);
  expect(w.calls.settle).toBe(0);
  expect(w.balance).toBe(3);
});

test("a provider that never settles its promise still times out and refunds", async () => {
  const { w, deps } = makeWorld({ provider: () => new Promise(() => {}) });
  const r = await generate(input(), CFG, deps);
  expect(r).toEqual({ ok: false, code: "timeout" });
  expect(w.calls.refund).toBe(1);
  expect(w.balance).toBe(3);
});

test("settle itself failing still refunds (the refund cannot be skipped)", async () => {
  const { w, deps } = makeWorld();
  deps.settle = async () => { w.calls.settle++; throw new Error("db down"); };
  const r = await generate(input(), CFG, deps);
  expect(r).toEqual({ ok: false, code: "provider_error" });
  expect(w.calls.refund).toBe(1);
  expect(w.balance).toBe(3);
});

test("an empty provider image is a failure and refunds", async () => {
  const { w, deps } = makeWorld({ provider: async () => "" });
  const r = await generate(input(), CFG, deps);
  expect(r).toEqual({ ok: false, code: "provider_error" });
  expect(w.calls.refund).toBe(1);
  expect(w.balance).toBe(3);
});

test("a failing refund is logged loudly and does not throw", async () => {
  const { w, deps } = makeWorld({ provider: async () => { throw new Error("boom"); } });
  deps.refund = async () => { w.calls.refund++; throw new Error("refund db down"); };
  const r = await generate(input(), CFG, deps);
  expect(r).toEqual({ ok: false, code: "provider_error" });
  expect(w.calls.logs.join(" ")).toContain("REFUND FAILED");
});

test("same requestId twice charges once and the provider is called once", async () => {
  const { w, deps } = makeWorld({ balance: 3 });
  const first = await generate(input("dup-1"), CFG, deps);
  const second = await generate(input("dup-1"), CFG, deps);
  expect(first.ok).toBe(true);
  expect(second).toEqual({ ok: false, code: "duplicate_request" });
  expect(w.calls.provider).toBe(1);
  expect(w.balance).toBe(2);
  expect(w.rows.filter((r) => r.requestId === "dup-1")).toHaveLength(1);
});

test("a duplicate while the first is still in flight does not call the provider or refund the first", async () => {
  let release: (v: string) => void = () => {};
  const { w, deps } = makeWorld({ provider: () => new Promise<string>((res) => { release = res; }) });
  const inflight = generate(input("dup-2"), CFG, deps);
  await new Promise((r) => setTimeout(r, 5));
  const second = await generate(input("dup-2"), CFG, deps);
  expect(second).toEqual({ ok: false, code: "duplicate_request" });
  expect(w.calls.refund).toBe(0);
  release("data:image/png;base64,BBBB");
  expect((await inflight).ok).toBe(true);
  expect(w.balance).toBe(2);
});

test("insufficient credits: that code, zero provider calls, nothing charged", async () => {
  const { w, deps } = makeWorld({ balance: 0 });
  const r = await generate(input(), CFG, deps);
  expect(r).toEqual({ ok: false, code: "insufficient_credits" });
  expect(w.calls.provider).toBe(0);
  expect(w.calls.refund).toBe(0);
  expect(w.balance).toBe(0);
  expect(w.rows).toHaveLength(0);
});

test("insufficient credits is also recognised from a database error message", async () => {
  const { w, deps } = makeWorld();
  deps.reserve = async () => { w.calls.reserve++; throw new Error('P0001: insufficient_credits'); };
  expect(await generate(input(), CFG, deps)).toEqual({ ok: false, code: "insufficient_credits" });
  expect(w.calls.provider).toBe(0);
});

test("the 7th call in a minute returns rate_limited_minute, with no reserve and no provider call", async () => {
  const { w, deps } = makeWorld({ balance: 50 });
  for (let i = 1; i <= 6; i++) expect((await generate(input(`r-${i}`), CFG, deps)).ok).toBe(true);
  const seventh = await generate(input("r-7"), CFG, deps);
  expect(seventh).toEqual({ ok: false, code: "rate_limited_minute" });
  expect(w.calls.provider).toBe(6);
  expect(w.calls.reserve).toBe(6);
  expect(w.balance).toBe(44);
});

test("refunded and failed attempts still count toward the minute limit", async () => {
  const { w, deps } = makeWorld({ balance: 50, provider: async () => { throw new Error("nope"); } });
  for (let i = 1; i <= 6; i++) await generate(input(`f-${i}`), CFG, deps);
  expect(await generate(input("f-7"), CFG, deps)).toEqual({ ok: false, code: "rate_limited_minute" });
  expect(w.balance).toBe(50);
});

test("the minute window slides: the 7th call a minute later is allowed", async () => {
  const { w, deps } = makeWorld({ balance: 50 });
  for (let i = 1; i <= 6; i++) await generate(input(`s-${i}`), CFG, deps);
  w.now = new Date(w.now.getTime() + 61_000);
  expect((await generate(input("s-7"), CFG, deps)).ok).toBe(true);
});

test("the 101st call in a day returns rate_limited_day", async () => {
  const { w, deps } = makeWorld({ balance: 500 });
  w.seedRows("user-1", 100, new Date("2026-11-17T01:00:00Z"));
  expect(await generate(input("d-101"), CFG, deps)).toEqual({ ok: false, code: "rate_limited_day" });
  expect(w.calls.reserve).toBe(0);
  expect(w.calls.provider).toBe(0);
});

test("the 100th call in a day is still allowed", async () => {
  const { w, deps } = makeWorld({ balance: 500 });
  w.seedRows("user-1", 99, new Date("2026-11-17T01:00:00Z"));
  expect((await generate(input("d-100"), CFG, deps)).ok).toBe(true);
});

test("the daily window resets at UTC midnight", async () => {
  const { w, deps } = makeWorld({ balance: 500, now: new Date("2026-11-18T00:30:00Z") });
  w.seedRows("user-1", 100, new Date("2026-11-17T23:00:00Z"));
  expect((await generate(input("d-new"), CFG, deps)).ok).toBe(true);
});

test("limits are per user: another user's usage does not block you", async () => {
  const { w, deps } = makeWorld({ balance: 50 });
  w.seedRows("someone-else", 100, new Date("2026-11-17T01:00:00Z"));
  expect((await generate(input("u-1", "user-1"), CFG, deps)).ok).toBe(true);
});

test("global sum at the budget returns busy, with no reserve", async () => {
  const { w, deps } = makeWorld({ balance: 50 });
  w.seedRows("others", 300, new Date("2026-11-17T01:00:00Z"));
  expect(await generate(input("g-1"), CFG, deps)).toEqual({ ok: false, code: "busy" });
  expect(w.calls.reserve).toBe(0);
  expect(w.calls.provider).toBe(0);
});

test("global sum one under the budget is still allowed; refunded rows do not count toward it", async () => {
  const a = makeWorld({ balance: 50 });
  a.w.seedRows("others", 299, new Date("2026-11-17T01:00:00Z"));
  expect((await generate(input("g-2"), CFG, a.deps)).ok).toBe(true);
  const b = makeWorld({ balance: 50 });
  b.w.seedRows("others", 400, new Date("2026-11-17T01:00:00Z"), "refunded");
  expect((await generate(input("g-3"), CFG, b.deps)).ok).toBe(true);
});

test("missing consent returns consent_required with no reserve and no provider call", async () => {
  const { w, deps } = makeWorld({ consent: false });
  expect(await generate(input(), CFG, deps)).toEqual({ ok: false, code: "consent_required" });
  expect(w.calls.reserve).toBe(0);
  expect(w.calls.provider).toBe(0);
  expect(w.balance).toBe(3);
});

test("the order of checks: consent is checked before limits, limits before the budget, the budget before reserve", async () => {
  const noConsent = makeWorld({ consent: false, balance: 0 });
  noConsent.w.seedRows("user-1", 100, new Date("2026-11-17T01:00:00Z"));
  noConsent.w.seedRows("others", 400, new Date("2026-11-17T01:00:00Z"));
  expect((await generate(input(), CFG, noConsent.deps))).toEqual({ ok: false, code: "consent_required" });
  const limited = makeWorld({ balance: 0 });
  limited.w.seedRows("user-1", 100, new Date("2026-11-17T01:00:00Z"));
  limited.w.seedRows("others", 400, new Date("2026-11-17T01:00:00Z"));
  expect((await generate(input(), CFG, limited.deps))).toEqual({ ok: false, code: "rate_limited_day" });
  const busy = makeWorld({ balance: 0 });
  busy.w.seedRows("others", 400, new Date("2026-11-17T01:00:00Z"));
  expect((await generate(input(), CFG, busy.deps))).toEqual({ ok: false, code: "busy" });
});

test("a model outside the allowlist is rejected before anything is reserved", async () => {
  const { w, deps } = makeWorld();
  const r = await generate({ ...input(), model: "openai/gpt-5-image-expensive" }, CFG, deps);
  expect(r).toEqual({ ok: false, code: "invalid_model" });
  expect(w.calls.reserve).toBe(0);
  expect(w.calls.provider).toBe(0);
});

test("the reserved model is the allowlisted default when none is requested", async () => {
  const seen: string[] = [];
  const { deps } = makeWorld();
  const orig = deps.reserve;
  deps.reserve = async (p) => { seen.push(p.model); return orig(p); };
  await generate(input(), CFG, deps);
  expect(seen).toEqual(["google/gemini-2.5-flash-image"]);
});

test("a reserve error that is not 'insufficient credits' fails safely without calling the provider", async () => {
  const { w, deps } = makeWorld();
  deps.reserve = async () => { w.calls.reserve++; throw new Error("connection reset"); };
  expect(await generate(input(), CFG, deps)).toEqual({ ok: false, code: "provider_error" });
  expect(w.calls.provider).toBe(0);
  expect(w.calls.refund).toBe(0);
});

test("utcMidnight returns the start of the UTC day", () => {
  expect(utcMidnight(new Date("2026-11-17T23:59:59Z")).toISOString()).toBe("2026-11-17T00:00:00.000Z");
  expect(utcMidnight(new Date("2026-11-18T00:00:00Z")).toISOString()).toBe("2026-11-18T00:00:00.000Z");
});

test("money conservation: after any mix of outcomes, balance + credits held by done rows equals the starting balance", async () => {
  let n = 0;
  const { w, deps } = makeWorld({ balance: 10, provider: async () => { n++; if (n % 2 === 0) throw new Error("flaky"); return "data:image/png;base64,CCCC"; } });
  for (let i = 1; i <= 6; i++) await generate(input(`m-${i}`), CFG, deps);
  const spent = w.rows.filter((r) => r.status === "done").reduce((a, r) => a + r.cost, 0);
  expect(w.balance + spent).toBe(10);
  expect(w.rows.filter((r) => r.status === "reserved")).toHaveLength(0);
});
