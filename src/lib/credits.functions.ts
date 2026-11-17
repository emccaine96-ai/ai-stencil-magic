import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Credits, consent and first-sign-in setup for server-key AI generation.
 * Amounts, reasons and idempotency keys all come from src/lib/server/ai-config.ts and the verified token, never from the client.
 */

export type LedgerRow = { id: string; created_at: string; delta: number; reason: string };

/** Current balance (through the admin client, after auth) and the caller's newest 50 ledger rows (through their own RLS). */
export const getMyCredits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [bal, ledger] = await Promise.all([
      supabaseAdmin.rpc("credit_balance", { p_user: userId }),
      supabase.from("credit_ledger").select("id, created_at, delta, reason").order("created_at", { ascending: false }).limit(50),
    ]);
    if (bal.error) {
      console.error("[getMyCredits] balance", bal.error.message);
      return { ok: false as const, error: "Could not load your credits. Please try again." };
    }
    if (ledger.error) {
      console.error("[getMyCredits] ledger", ledger.error.message);
      return { ok: false as const, error: "Could not load your credit history. Please try again." };
    }
    return { ok: true as const, balance: Number(bal.data ?? 0), ledger: (ledger.data ?? []) as LedgerRow[] };
  });

/** Records that the caller agreed to AI processing, for the current consent version. Writes only the caller's own profile row. */
export const recordAiConsent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const { CONSENT_VERSION } = await import("@/lib/server/ai-config");
    // ai_consent_version is added by migration 20261117190000; the generated types do not list it until then.
    const patch = { ai_consent_at: new Date().toISOString(), ai_consent_version: CONSENT_VERSION } as unknown as { ai_consent_at: string };
    const { data, error } = await supabase.from("profiles").update(patch).eq("id", userId).select("id");
    if (error) {
      console.error("[recordAiConsent]", error.message);
      return { ok: false as const, error: "Could not save your consent. Please try again." };
    }
    // RLS can turn a blocked update into 0 affected rows with no error. Never report success unless exactly one row changed.
    if (!data || data.length !== 1) {
      console.error("[recordAiConsent] no profile row was updated for", userId);
      return { ok: false as const, error: "Your profile is not ready yet. Please reload and try again." };
    }
    return { ok: true as const, version: CONSENT_VERSION };
  });

/**
 * Called once after sign-in. Creates the caller's profile row if it is missing, then grants the signup credits.
 * Idempotent: the profile insert ignores conflicts, and grant_credits is keyed by 'signup:<userId>' on a unique index,
 * so repeated calls (and existing users on their next sign-in) cannot grant more than once.
 */
export const ensureProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const [{ supabaseAdmin }, { SIGNUP_GRANT }] = await Promise.all([
      import("@/integrations/supabase/client.server"),
      import("@/lib/server/ai-config"),
    ]);
    const ins = await supabaseAdmin.from("profiles").upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
    if (ins.error) {
      console.error("[ensureProfile] profile", ins.error.message);
      return { ok: false as const };
    }
    const grant = await supabaseAdmin.rpc("grant_credits", { p_user: userId, p_amount: SIGNUP_GRANT, p_reason: "signup", p_store_txn: `signup:${userId}` });
    if (grant.error) {
      console.error("[ensureProfile] grant", grant.error.message);
      return { ok: false as const };
    }
    return { ok: true as const };
  });
