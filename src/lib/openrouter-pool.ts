/**
 * OpenRouter image generation with model fallback and retry.
 *
 * Every model in this pool can OUTPUT images (checked against openrouter.ai/api/v1/models,
 * architecture.output_modalities includes "image"). Text-only models are deliberately excluded:
 * routing a stencil request to one would return no image.
 *
 * Fallback uses OpenRouter's native top-level `models` array, so a primary that is down, rate
 * limited or moderated is retried on the next model by OpenRouter itself, in one request.
 * On top of that, transient failures (429, 5xx, network) are retried with exponential backoff.
 * Auth and bad-request errors are never retried.
 */

export const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/** Default primary model, kept from the original implementation. */
export const PRIMARY_IMAGE_MODEL = "google/gemini-2.5-flash-image";

/**
 * Image-capable fallbacks, in order. Same image-in, image-out contract as the primary.
 * OpenRouter tries these when the primary fails.
 */
export const IMAGE_FALLBACK_MODELS: readonly string[] = [
  "google/gemini-3.1-flash-image",
  "google/gemini-3-pro-image",
  "openai/gpt-5-image-mini",
];

export type ORImageInput = { mimeType: string; data: string };

export type GenerateImageParams = {
  apiKey: string;
  prompt: string;
  images: ORImageInput[];
  /** Caller-chosen primary model. Falls back to PRIMARY_IMAGE_MODEL. */
  model?: string;
  /** Override the fallback chain (mainly for tests). */
  fallbackModels?: readonly string[];
  maxRetries?: number;
  baseDelayMs?: number;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

export type GenerateImageResult =
  | { ok: true; dataUrl: string; model?: string; attempts: number }
  | { ok: false; status: number; error: string; attempts: number };

/** Pull a data URL out of any of the response shapes OpenRouter image models use. */
export function extractImageDataUrl(data: unknown): string | null {
  const message = (data as { choices?: { message?: Record<string, unknown> }[] })?.choices?.[0]?.message;
  if (!message) return null;

  // Documented format: message.images[].image_url.url
  const images = message.images as { image_url?: { url?: string }; url?: string }[] | undefined;
  if (Array.isArray(images) && images.length > 0) {
    const url = images[0]?.image_url?.url ?? images[0]?.url;
    if (typeof url === "string" && url.length > 0) return url;
  }

  const content = message.content as unknown;
  const dataUrlRe = /data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/;
  if (typeof content === "string") {
    const m = content.match(dataUrlRe);
    return m ? m[0] : null;
  }
  if (Array.isArray(content)) {
    for (const part of content as Record<string, any>[]) {
      if (typeof part === "string") {
        const m = (part as string).match(dataUrlRe);
        if (m) return m[0];
      }
      if (part?.type === "image_url" && part?.image_url?.url) return part.image_url.url as string;
      const inline = part?.inline_data ?? part?.inlineData;
      if (inline?.data) {
        const mime = inline.mime_type ?? inline.mimeType ?? "image/png";
        return `data:${mime};base64,${inline.data}`;
      }
    }
  }
  return null;
}

/** Statuses worth retrying: rate limit, request timeout, and upstream/server failures. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

/** Backoff with jitter: base * 2^attempt, capped at 20s. Honors a Retry-After header when present. */
export function backoffMs(attempt: number, base: number, retryAfterHeader?: string | null): number {
  if (retryAfterHeader) {
    const secs = Number(retryAfterHeader);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(20000, secs * 1000);
  }
  const exp = Math.min(20000, base * 2 ** attempt);
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

function friendlyError(status: number, upstreamText: string): string {
  if (status === 401 || status === 403) return "OpenRouter API key invalid. Check your key in Settings.";
  if (status === 402) return "OpenRouter account is out of credits.";
  if (status === 429) return "OpenRouter rate limit reached. Please try again.";
  if (status >= 500) return "The AI service is temporarily unavailable. Please try again.";
  // Keep upstream detail for 4xx (moderation, bad image) but bound its size.
  const t = (upstreamText || "").trim().slice(0, 300);
  return t || `OpenRouter error ${status}`;
}

/**
 * Generate an image. Never throws; always resolves to a result object.
 */
export async function generateImageWithFallback(p: GenerateImageParams): Promise<GenerateImageResult> {
  const doFetch = p.fetchImpl ?? fetch;
  const sleep = p.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxRetries = p.maxRetries ?? 2;
  const baseDelay = p.baseDelayMs ?? 1500;
  const timeoutMs = p.timeoutMs ?? 120_000;

  const primary = p.model || PRIMARY_IMAGE_MODEL;
  const chain = [primary, ...(p.fallbackModels ?? IMAGE_FALLBACK_MODELS).filter((m) => m !== primary)];

  const body = JSON.stringify({
    // `models` is OpenRouter's native fallback list; `model` is kept for older routing.
    model: chain[0],
    models: chain,
    modalities: ["image", "text"],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: p.prompt },
          ...p.images.map((img) => ({
            type: "image_url" as const,
            image_url: { url: `data:${img.mimeType};base64,${img.data}` },
          })),
        ],
      },
    ],
  });

  let attempts = 0;
  let last: { status: number; error: string } = { status: 502, error: "No response from OpenRouter" };

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts++;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await doFetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${p.apiKey}`,
          "HTTP-Referer": "https://ai-stencil-magic.app",
          "X-Title": "AI Stencil Magic",
        },
        body,
        signal: ctrl.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        last = { status: res.status, error: friendlyError(res.status, text) };
        if (!isRetryableStatus(res.status) || attempt === maxRetries) break;
        await sleep(backoffMs(attempt, baseDelay, res.headers.get("retry-after")));
        continue;
      }

      const data = await res.json();
      const url = extractImageDataUrl(data);
      if (url) {
        return { ok: true, dataUrl: url, model: (data as { model?: string }).model, attempts };
      }
      // 200 with no image: the model refused or returned text. One more try may land on a fallback.
      last = { status: 502, error: "The AI model did not return an image. Try again or pick another model." };
      if (attempt === maxRetries) break;
      await sleep(backoffMs(attempt, baseDelay));
    } catch (e) {
      const aborted = (e as { name?: string })?.name === "AbortError";
      last = {
        status: aborted ? 504 : 502,
        error: aborted ? "The AI service took too long to respond." : "Could not reach the AI service.",
      };
      if (attempt === maxRetries) break;
      await sleep(backoffMs(attempt, baseDelay));
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, status: last.status, error: last.error, attempts };
}
