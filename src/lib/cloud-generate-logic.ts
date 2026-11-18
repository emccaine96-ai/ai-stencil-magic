// src/lib/cloud-generate-logic.ts
/**
 * Pure logic behind useCloudGenerate, kept apart from React so it can be tested.
 * It imports nothing from the server folder: result codes are plain strings that match generate-core's codes.
 */

export type CloudCode =
  | "consent_required"
  | "rate_limited_minute"
  | "rate_limited_day"
  | "busy"
  | "insufficient_credits"
  | "duplicate_request"
  | "provider_error"
  | "timeout"
  | "invalid_model"
  | "owner_use_own_key";

/** What the user is told for each failure. Never includes upstream text. */
export const CODE_MESSAGES: Record<CloudCode, string> = {
  consent_required: "Please agree to AI processing first.",
  rate_limited_minute: "You are going a bit fast. Wait a minute and try again.",
  rate_limited_day: "You reached today's limit for cloud generations. It resets at midnight UTC.",
  busy: "Cloud generation is very busy right now. Please try again later, or use your own API key in Settings.",
  insufficient_credits: "You are out of credits. You can still generate with your own API key in Settings.",
  duplicate_request: "That request is already being processed.",
  provider_error: "The AI service could not make your stencil. You were not charged. Please try again.",
  timeout: "The AI service took too long. You were not charged. Please try again.",
  invalid_model: "That model is not available.",
  owner_use_own_key: "This account uses its own API keys. Add your OpenRouter or Gemini key in Settings.",
};

export const FALLBACK_MESSAGE = "Something went wrong. You were not charged. Please try again.";

export function messageForCode(code: unknown): string {
  return typeof code === "string" && code in CODE_MESSAGES ? CODE_MESSAGES[code as CloudCode] : FALLBACK_MESSAGE;
}

/** Codes after which the credit was refunded or never taken, so the next attempt must use a NEW request id. */
const NEEDS_NEW_ID = new Set<string>(["provider_error", "timeout", "rate_limited_minute", "rate_limited_day", "busy", "insufficient_credits", "consent_required", "invalid_model", "owner_use_own_key"]);

/**
 * Keeps one request id for an in-flight attempt (so a double tap is deduplicated by the server) and issues a fresh one
 * after any failure, refund, or success. `newId` is injectable for tests.
 */
export class RequestIdKeeper {
  private current: string | null = null;
  constructor(private readonly newId: () => string = () => crypto.randomUUID()) {}

  /** The id for the attempt that is starting now. Reuses the id while an attempt is still in flight. */
  acquire(): string {
    if (!this.current) this.current = this.newId();
    return this.current;
  }

  /** Call when an attempt ends. After this, the next acquire() returns a new id. */
  release(): void {
    this.current = null;
  }

  /** Whether a result with this code needs a new id. (Every ended attempt releases, so this is informational for tests and logs.) */
  static needsNewId(code: string): boolean {
    return NEEDS_NEW_ID.has(code);
  }
}

export type ServerResult = { ok: true; image: string; balance: number } | { ok: false; code: string };

export type CloudOutcome =
  | { kind: "image"; dataUrl: string; balance: number }
  | { kind: "needs_consent" }
  | { kind: "error"; message: string };

/** Turns a server result (or a thrown error) into what the UI should do. */
export function interpretResult(r: ServerResult | undefined | null): CloudOutcome {
  if (!r || typeof r !== "object") return { kind: "error", message: FALLBACK_MESSAGE };
  if (r.ok === true) {
    if (typeof r.image === "string" && r.image.startsWith("data:image/")) return { kind: "image", dataUrl: r.image, balance: Number(r.balance ?? 0) };
    return { kind: "error", message: FALLBACK_MESSAGE };
  }
  if (r.code === "consent_required") return { kind: "needs_consent" };
  return { kind: "error", message: messageForCode(r.code) };
}

export interface PreparedImage {
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  data: string;
}

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp"]);

/** Splits a data URL into the {mimeType, data} the server expects. Returns null for anything the server would reject. */
export function dataUrlToImage(dataUrl: string): PreparedImage | null {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  if (!ALLOWED.has(mime)) return null;
  return { mimeType: mime as PreparedImage["mimeType"], data: m[2] };
}
