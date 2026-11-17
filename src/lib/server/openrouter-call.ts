// src/lib/server/openrouter-call.ts
/**
 * The one OpenRouter chat-completions call used by server-key generation. The request body and the response parsing mirror
 * src/routes/api/generate-stencil.ts exactly (same endpoint, headers, modalities, and image extraction order), so behaviour
 * matches the existing route. Pure apart from `fetch`, which is injectable for tests.
 *
 * Secrets: the API key is a parameter. It is never logged and never returned. Upstream error bodies are NEVER returned.
 */
import { ProviderTimeoutError } from "./generate-core";

export interface InlineImage {
  mimeType: string;
  data: string;
}

export interface OpenRouterCallArgs {
  apiKey: string;
  model: string;
  prompt: string;
  images: InlineImage[];
  signal: AbortSignal;
  fetchImpl?: typeof fetch;
  log?: (message: string, detail?: unknown) => void;
}

/** Removes every occurrence of the API key from text before it is logged. An upstream error body can echo the key back. */
export function redactKey(text: string, apiKey: string): string {
  if (!apiKey) return text;
  return text.split(apiKey).join("[redacted-key]");
}

const IMG_IN_TEXT = /data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/;

/** Extracts a data URL from an OpenRouter completion, in the same order as the existing route. Returns null if none. */
export function extractImage(data: unknown): string | null {
  const message = (data as { choices?: Array<{ message?: Record<string, unknown> }> })?.choices?.[0]?.message;
  if (!message) return null;

  const images = message.images as Array<{ image_url?: { url?: string }; url?: string }> | undefined;
  if (Array.isArray(images) && images.length > 0) {
    const url = images[0]?.image_url?.url ?? images[0]?.url;
    if (typeof url === "string" && url.length > 0) return url;
  }

  const content = message.content;
  if (typeof content === "string") {
    const m = content.match(IMG_IN_TEXT);
    return m ? m[0] : null;
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (typeof part === "string") {
        const m = part.match(IMG_IN_TEXT);
        if (m) return m[0];
      }
      const p = part as { type?: string; image_url?: { url?: string } };
      if (p?.type === "image_url" && typeof p.image_url?.url === "string" && p.image_url.url.length > 0) return p.image_url.url;
    }
  }
  return null;
}

/** Calls OpenRouter. Resolves with a data URL, or rejects: ProviderTimeoutError on abort, Error otherwise (message is safe to log). */
export async function callOpenRouter(a: OpenRouterCallArgs): Promise<string> {
  const doFetch = a.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: a.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${a.apiKey}`,
        "HTTP-Referer": "https://ai-stencil-magic.app",
        "X-Title": "AI Stencil Magic",
      },
      body: JSON.stringify({
        model: a.model,
        modalities: ["image", "text"],
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: a.prompt },
              ...a.images.map((img) => ({ type: "image_url" as const, image_url: { url: `data:${img.mimeType};base64,${img.data}` } })),
            ],
          },
        ],
      }),
    });
  } catch (e) {
    if (a.signal.aborted || (e as { name?: string })?.name === "AbortError") throw new ProviderTimeoutError();
    throw new Error(`network error: ${(e as { message?: string })?.message ?? "unknown"}`);
  }

  if (!res.ok) {
    // Keep the upstream body server-side; it can echo account or key details. Only a short, key-free status is thrown.
    const body = await res.text().catch(() => "");
    a.log?.("[openrouter] error", `${res.status} ${redactKey(body, a.apiKey).slice(0, 300)}`);
    throw new Error(`openrouter status ${res.status}`);
  }

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    throw new Error("openrouter returned non-JSON");
  }
  const image = extractImage(data);
  if (!image) throw new Error("openrouter returned no image");
  return image;
}
