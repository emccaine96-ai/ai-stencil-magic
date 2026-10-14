// Single source of truth for what each plan unlocks. Pure and dependency-free so the server and the
// UI share it. The SERVER is the authority for anything that costs money to run (AI generation,
// cloud storage, plugin distribution); client-side gating is a UX convenience only, because code
// running in the browser can always be modified by its owner.

export type Tier = "free" | "gemini" | "pro";
export type SubStatus = "inactive" | "active" | "trialing" | "past_due" | "canceled";

export type Feature =
  | "client-engine" // free, runs locally
  | "vault-editor" // free
  | "vault-basic-tools"
  | "upscale-6k"
  | "remove-bg"
  | "plugins"
  | "gemini-engine"
  | "openrouter-hybrid-engine"
  | "cloud-sync";

const FEATURES_BY_TIER: Record<Tier, readonly Feature[]> = {
  free: ["client-engine", "vault-editor", "vault-basic-tools"],
  gemini: ["client-engine", "vault-editor", "vault-basic-tools", "gemini-engine"],
  pro: [
    "client-engine",
    "vault-editor",
    "vault-basic-tools",
    "gemini-engine",
    "openrouter-hybrid-engine",
    "upscale-6k",
    "remove-bg",
    "plugins",
    "cloud-sync",
  ],
};

/** Statuses that count as paid. past_due keeps access briefly so a failed card isn't an instant lockout. */
const PAID_STATUSES: readonly SubStatus[] = ["active", "trialing", "past_due"];

export function effectiveTier(tier: Tier | null | undefined, status: SubStatus | null | undefined): Tier {
  if (!tier || tier === "free") return "free";
  if (!status || !PAID_STATUSES.includes(status)) return "free";
  return tier;
}

export function can(tier: Tier, feature: Feature): boolean {
  return FEATURES_BY_TIER[tier].includes(feature);
}

export const TIER_LABEL: Record<Tier, string> = { free: "Free", gemini: "Gemini", pro: "Pro" };
