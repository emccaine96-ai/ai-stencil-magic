// src/lib/server/generation-schema.ts
/**
 * Input validation for generateStencil. Kept in its own module (no server-only imports) so it can be unit-tested.
 * Limits come from ai-config.ts, which copies the existing /api/generate-stencil limits.
 */
import { z } from "zod";
import { ALLOWED_MIME, MAX_CUSTOM_NOTE_CHARS, MAX_IMAGES, MAX_IMAGE_B64_CHARS, STYLES } from "./ai-config";

/** Base64 payload only (no "data:" prefix). Allows standard base64 with optional padding; rejects anything else. */
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export const ImageSchema = z.object({
  mimeType: z.enum(ALLOWED_MIME),
  data: z.string().min(8).max(MAX_IMAGE_B64_CHARS).regex(BASE64, "image data must be raw base64"),
});

export const GenerateStencilInput = z.object({
  style: z.enum(STYLES),
  intensity: z.number().min(0).max(1),
  customNote: z.string().max(MAX_CUSTOM_NOTE_CHARS).optional(),
  images: z.array(ImageSchema).min(1).max(MAX_IMAGES),
  /** Accepted for future use. The cost is always COST_PER_GENERATION from ai-config; this value is never trusted for pricing. */
  tier: z.enum(["standard", "pro", "master"]).optional(),
  requestId: z.string().uuid(),
});

export type GenerateStencilInput = z.infer<typeof GenerateStencilInput>;
