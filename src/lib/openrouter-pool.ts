/**
 * OpenRouter AI model pool with intelligent fallback routing.
 *
 * Connects to https://openrouter.ai/api/v1 using the OpenAI SDK pattern.
 * Models route through a free-tier fallback array if the primary "auto" model
 * is unavailable. Includes retry logic for 429 rate limit errors.
 *
 * Free-tier models:
 *  - deepseek/deepseek-r1:free          (Deep reasoning, complex logic)
 *  - meta-llama/llama-3.3-70b:free      (General purpose, fast)
 *  - qwen/qwen-2.5-coder-32b:free       (Code specialist)
 */

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Free-tier fallback models. OpenRouter "auto" mode will intelligently
 * route requests through these if the primary model is overloaded.
 */
export const FALLBACK_MODELS = [
  "deepseek/deepseek-r1:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen-2.5-coder-32b-instruct:free",
] as const;

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; [key: string]: unknown }>;
}

export interface OpenRouterRequest {
  model?: string; // Defaults to "auto"
  messages: OpenRouterMessage[];
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  [key: string]: unknown;
}

export interface OpenRouterResponse {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export interface OpenRouterError {
  error: {
    code: number | string;
    message: string;
    status: number;
  };
}

/**
 * Call OpenRouter chat completion API with automatic retry on 429 errors.
 *
 * @param apiKey - OpenRouter API key
 * @param request - Chat completion request (model defaults to "auto")
 * @param options - Retry configuration
 * @returns OpenRouter response
 * @throws Error if all retries fail
 *
 * @example
 * const response = await callOpenRouterWithRetry(apiKey, {
 *   model: 'auto', // Triggers free-tier fallback array
 *   messages: [{ role: 'user', content: 'Explain this TypeScript code' }],
 * });
 */
export async function callOpenRouterWithRetry(
  apiKey: string,
  request: OpenRouterRequest,
  options: {
    maxRetries?: number;
    retryDelayMs?: number;
  } = {},
): Promise<OpenRouterResponse> {
  const { maxRetries = 3, retryDelayMs = 5000 } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add fallback models via extra_body when using "auto"
      const body: Record<string, unknown> = {
        ...request,
        model: request.model ?? "auto",
      };

      // Inject fallback array only for "auto" model routing
      if (body.model === "auto") {
        body.extra_body = {
          fallback_models: FALLBACK_MODELS,
        };
      }

      const response = await fetch(`${OPENROUTER_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": "https://ai-stencil-magic.app",
          "X-Title": "AI Stencil Magic",
        },
        body: JSON.stringify(body),
      });

      // Handle non-429 errors first
      if (response.status === 429) {
        if (attempt < maxRetries) {
          const delayMs = retryDelayMs * (attempt + 1); // Linear backoff
          console.warn(
            `[OpenRouter] Rate limited (429). Retry ${attempt + 1}/${maxRetries} after ${delayMs}ms`,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue; // Retry
        }
        // Fall through to error handling after max retries
      }

      if (!response.ok) {
        const errorData = (await response.json()) as OpenRouterError | Record<string, unknown>;
        const errorMsg =
          (errorData as OpenRouterError).error?.message ||
          `OpenRouter error ${response.status}`;
        throw new Error(errorMsg);
      }

      const data = (await response.json()) as OpenRouterResponse;
      return data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Only retry on 429; other errors fail immediately
      if (attempt < maxRetries && lastError.message.includes("429")) {
        const delayMs = retryDelayMs * (attempt + 1);
        console.warn(
          `[OpenRouter] Retrying after ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      } else if (attempt === maxRetries) {
        // All retries exhausted
        throw lastError;
      } else {
        // Non-429 error, don't retry
        throw lastError;
      }
    }
  }

  throw lastError || new Error("OpenRouter call failed after retries");
}

/**
 * Convenience wrapper for text-only completions.
 *
 * @example
 * const answer = await generateTextWithOpenRouter(apiKey, 'How does this React hook work?', {
 *   model: 'deepseek/deepseek-r1:free', // Use reasoning model explicitly
 *   temperature: 0.7,
 * });
 */
export async function generateTextWithOpenRouter(
  apiKey: string,
  prompt: string,
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    maxRetries?: number;
  } = {},
): Promise<string> {
  const response = await callOpenRouterWithRetry(
    apiKey,
    {
      model: options.model ?? "auto",
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: options.temperature,
      max_tokens: options.maxTokens,
    },
    { maxRetries: options.maxRetries },
  );

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("No content in OpenRouter response");
  return content;
}

/**
 * Get information about available models.
 */
export function getAvailableModels() {
  return {
    auto: {
      name: "Auto (Intelligent Routing)",
      description: "Automatically routes to best available model from fallback array",
      fallback: FALLBACK_MODELS,
    },
    deepseek: {
      name: "DeepSeek R1",
      id: "deepseek/deepseek-r1:free",
      strength: "Deep reasoning, complex logic, code explanation",
      costPerMToken: 0, // Free tier
    },
    llama: {
      name: "Meta Llama 3.3 70B",
      id: "meta-llama/llama-3.3-70b-instruct:free",
      strength: "General purpose, fast inference, instruction following",
      costPerMToken: 0, // Free tier
    },
    qwen: {
      name: "Qwen 2.5 Coder 32B",
      id: "qwen/qwen-2.5-coder-32b-instruct:free",
      strength: "Code generation, TypeScript, React, technical tasks",
      costPerMToken: 0, // Free tier
    },
  };
}
