// src/lib/server/ai-config.ts
/**
 * The ONE place for server-key AI generation settings: provider, model, price, grants, limits, timeouts and image limits.
 * Change a number here and nowhere else. Server modules (generate-core, generation.functions) import it directly.
 * Components may import the display numbers, which are plain constants with no secrets or server-only imports.
 *
 * Image/MIME limits are copied from src/routes/api/generate-stencil.ts; keep them equal.
 */

export const PROVIDER = "openrouter" as const;
export const DEFAULT_MODEL = "google/gemini-2.5-flash-image";
/** The server only ever uses a model from this list. A client-chosen model is never forwarded. */
export const MODEL_ALLOWLIST: readonly string[] = [DEFAULT_MODEL];

/** Credits charged per cloud generation, for every tier. */
export const COST_PER_GENERATION = 1;
/** Credits granted once per account on first sign-in (idempotent by 'signup:<userId>'). */
export const SIGNUP_GRANT = 3;

export const PER_MINUTE_LIMIT = 6;
export const PER_DAY_LIMIT = 100;
/** Global daily cap in credits; overridden by the DAILY_BUDGET_CREDITS environment variable when it is a valid number. */
export const DEFAULT_DAILY_BUDGET = 300;

export const UPSTREAM_TIMEOUT_MS = 90_000;
export const CONSENT_VERSION = "v1";

export const MAX_IMAGES = 3;
export const MAX_IMAGE_B64_CHARS = 14_000_000; // ~10 MB decoded per image
export const ALLOWED_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_CUSTOM_NOTE_CHARS = 500;

export const STYLES = ["hatching", "solid", "dotwork", "hybrid"] as const;
export type CloudStyle = (typeof STYLES)[number];

/** Reads DAILY_BUDGET_CREDITS safely: a missing, non-numeric, zero or negative value falls back to the default. */
export function resolveDailyBudget(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_DAILY_BUDGET;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_DAILY_BUDGET;
}
