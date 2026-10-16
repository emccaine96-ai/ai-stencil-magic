/**
 * OpenRouter pool — thin client-side helper for BYOK chat completions.
 *
 * Notes:
 *  - The browser never sees the server key: callers pass their own key
 *    (stored in localStorage by Settings) or the request goes through
 *    /api/generate-stencil which injects the server key server-side.
 *  - No VITE_* key is read here: anything prefixed VITE_ is inlined into the
 *    public client bundle, so it must never hold a secret.
 */
export const openRouterConfig = {
  defaultModel: "google/gemini-2.5-flash-image",
  fallbackModel: "openrouter/auto",
  temperature: 0.15,
  maxTokens: 4096,
} as const;

export interface OpenRouterOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  apiKey?: string;
}

/**
 * Send a single chat completion request using the supplied API key or the saved browser key.
 *
 * @param prompt - Text sent as the user message.
 * @param options - Optional model, sampling, token limit, and API key overrides.
 * @returns The parsed JSON response from OpenRouter.
 * @throws If no key is available, the request fails, or the response is invalid JSON.
 */
export async function fetchOpenRouterCompletion(
  prompt: string,
  options: OpenRouterOptions = {},
): Promise<unknown> {
  const apiKey =
    options.apiKey ||
    (typeof localStorage !== "undefined" ? localStorage.getItem("stencilmagic.openrouter.key") : null);
  if (!apiKey) throw new Error("Missing Bring-Your-Own-Key configuration.");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": typeof location !== "undefined" ? location.origin : "https://ai-stencil-magic.app",
      "X-Title": "AI Stencil Magic",
    },
    body: JSON.stringify({
      model: options.model || openRouterConfig.defaultModel,
      messages: [{ role: "user", content: prompt }],
      temperature: options.temperature ?? openRouterConfig.temperature,
      max_tokens: options.maxTokens ?? openRouterConfig.maxTokens,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`OpenRouter error ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  return response.json();
}
