import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { GenerateStencilInput } from "@/lib/server/generation-schema";

/**
 * Server-key AI generation, paid for with credits. The ONLY entry point for generating with the server's OpenRouter key.
 * All pricing, limits and the model live in src/lib/ai-server/ai-config.ts. All decisions live in the tested generate-core.ts;
 * this file only wires real dependencies (database, OpenRouter) into it.
 *
 * Secrets are read here, inside the handler, and nowhere else: OPENROUTER_API_KEY, DAILY_BUDGET_CREDITS (optional).
 * SUPABASE_SERVICE_ROLE_KEY is used implicitly by the admin client. ALLOW_SERVER_KEY is intentionally not read.
 */
export const generateStencil = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => GenerateStencilInput.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const [{ supabaseAdmin }, core, cfgMod, promptsMod, orMod] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/server/generate-core"),
      import("@/lib/ai-server/ai-config"),
      import("@/lib/server/prompts"),
      import("@/lib/server/openrouter-call"),
    ]);

    const apiKey = process.env.OPENROUTER_API_KEY ?? "";
    if (!apiKey) {
      console.error("[generateStencil] OPENROUTER_API_KEY is not set");
      return { ok: false as const, code: "provider_error" as const };
    }
    const dailyBudget = cfgMod.resolveDailyBudget(process.env.DAILY_BUDGET_CREDITS);
    const ownerIds = cfgMod.parseOwnerIds(process.env.OWNER_USER_IDS);

    // Built with the server copy of the prompts (byte-identical to create.tsx; see prompts.test.ts).
    const prompt = promptsMod.buildPrompt({ style: data.style, intensity: data.intensity, customPrompt: data.customNote });

    const deps: import("@/lib/server/generate-core").GenerateDeps = {
      now: () => new Date(),
      hasConsent: async (uid) => {
        // ai_consent_version is added by migration 20261117190000; the generated types do not list it until that migration is
        // applied and the types are regenerated, so the select is cast. Until then this query errors and the user is asked to retry.
        const { data: row, error } = await supabaseAdmin.from("profiles").select("ai_consent_at, ai_consent_version" as "ai_consent_at").eq("id", uid).maybeSingle();
        if (error) throw error;
        const r = row as unknown as { ai_consent_at?: string | null; ai_consent_version?: string | null } | null;
        return !!r?.ai_consent_at && r.ai_consent_version === cfgMod.CONSENT_VERSION;
      },
      countUser: async (uid, since) => {
        const { count, error } = await supabaseAdmin.from("generation_requests").select("request_id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", since.toISOString());
        if (error) throw error;
        return count ?? 0;
      },
      sumGlobal: async (since) => {
        const { data: rows, error } = await supabaseAdmin.from("generation_requests").select("cost").gte("created_at", since.toISOString()).in("status", ["reserved", "done"]);
        if (error) throw error;
        return (rows ?? []).reduce((a, r) => a + (r.cost ?? 0), 0);
      },
      reserve: async ({ userId: uid, requestId, cost, model, provider }) => {
        const { data: res, error } = await supabaseAdmin.rpc("reserve_credits", { p_user: uid, p_request: requestId, p_cost: cost, p_model: model, p_provider: provider });
        if (error) {
          if (String(error.message).includes("insufficient_credits")) throw new core.InsufficientCreditsError();
          throw error;
        }
        const r = (res ?? {}) as { already_reserved?: boolean; balance?: number };
        return { already_reserved: !!r.already_reserved, balance: typeof r.balance === "number" ? r.balance : undefined };
      },
      settle: async (requestId) => {
        const { error } = await supabaseAdmin.rpc("settle_request", { p_request: requestId });
        if (error) throw error;
      },
      refund: async (requestId) => {
        const { error } = await supabaseAdmin.rpc("refund_request", { p_request: requestId });
        if (error) throw error;
      },
      balance: async (uid) => {
        const { data: b, error } = await supabaseAdmin.rpc("credit_balance", { p_user: uid });
        if (error) throw error;
        return Number(b ?? 0);
      },
      callProvider: ({ model, signal }) =>
        orMod.callOpenRouter({ apiKey, model, prompt, images: data.images, signal, log: (m, d) => console.error(m, d) }),
      log: (m, d) => console.error(m, d ?? ""),
    };

    // NOTE: no `model` is passed from the client. The server only ever uses cfgMod.DEFAULT_MODEL (allowlisted).
    // `data.tier` is accepted for future use and is deliberately not used for pricing.
    return core.generate(
      { userId, requestId: data.requestId },
      {
        provider: cfgMod.PROVIDER,
        model: cfgMod.DEFAULT_MODEL,
        modelAllowlist: cfgMod.MODEL_ALLOWLIST,
        cost: cfgMod.COST_PER_GENERATION,
        perMinuteLimit: cfgMod.PER_MINUTE_LIMIT,
        perDayLimit: cfgMod.PER_DAY_LIMIT,
        dailyBudget,
        timeoutMs: cfgMod.UPSTREAM_TIMEOUT_MS,
        ownerIds,
      },
      deps,
    );
  });
