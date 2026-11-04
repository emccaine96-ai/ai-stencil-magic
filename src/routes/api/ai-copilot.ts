import { createFileRoute } from "@tanstack/react-router";
import { bodyLimit, H3Event, HTTPError } from "h3";

type Body = {
  prompt: string;
  image?: string; // dataURL of current canvas (for edits)
  reference?: string; // optional second image (style transfer source)
};

const MAX_PROMPT_CHARS = 2000;
const MAX_IMAGE_B64_CHARS = 14_000_000; // ~10 MB decoded per image (same as generate-stencil)
const MAX_IMAGES = 2;
const MAX_REQUEST_BODY_BYTES = MAX_IMAGE_B64_CHARS * MAX_IMAGES + 64 * 1024;
const limitCopilotBody = bodyLimit(MAX_REQUEST_BODY_BYTES);
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(url);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

/**
 * Server env keys may be used only when ALLOW_SERVER_KEY === 'true' AND the
 * caller presents a valid signed-in user's Bearer token.
 */
async function gateServerKey(request: Request): Promise<Response | null> {
  if (process.env.ALLOW_SERVER_KEY !== "true") {
    return Response.json(
      { error: "Server AI is not enabled yet", code: "server_ai_disabled" },
      { status: 403 },
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const url = process.env.SUPABASE_URL;
  const pub = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!token || !url || !pub) {
    return Response.json({ error: "Sign in required", code: "auth_required" }, { status: 401 });
  }
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, pub, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getClaims(token);
  if (error || !data?.claims?.sub) {
    return Response.json({ error: "Sign in required", code: "auth_required" }, { status: 401 });
  }
  return null;
}

export const Route = createFileRoute("/api/ai-copilot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await gateServerKey(request);
        if (denied) return denied;
        const key = process.env.GEMINI_API_KEY;
        if (!key) return Response.json({ error: "Server AI is not configured" }, { status: 500 });

        let body: Body;
        try {
          const event = new H3Event(request);
          body = (await limitCopilotBody(event, () => event.req.json())) as Body;
        } catch (error) {
          if (HTTPError.isError(error) && error.status === 413) {
            return Response.json({ error: "Request body is too large" }, { status: 413 });
          }
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        if (!body?.prompt || typeof body.prompt !== "string" || body.prompt.length > MAX_PROMPT_CHARS) {
          return Response.json({ error: "Invalid prompt" }, { status: 400 });
        }

        const parts: any[] = [{ text: body.prompt }];
        for (const src of [body.image, body.reference]) {
          if (src === undefined || src === null || src === "") continue;
          if (typeof src !== "string") {
            return Response.json({ error: "Invalid image" }, { status: 400 });
          }
          const parsed = parseDataUrl(src);
          if (
            !parsed ||
            !ALLOWED_MIME.has(parsed.mimeType) ||
            parsed.data.length === 0 ||
            parsed.data.length > MAX_IMAGE_B64_CHARS
          ) {
            return Response.json({ error: "Invalid image" }, { status: 400 });
          }
          parts.push({ inline_data: { mime_type: parsed.mimeType, data: parsed.data } });
        }

        // Key goes in a header, not the URL, so it stays out of access logs.
        const upstream = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
            }),
          },
        );

        const text = await upstream.text();
        if (!upstream.ok) {
          // Upstream bodies stay server-side; never echo them to the client.
          console.error("[ai-copilot] Gemini error", upstream.status, text.slice(0, 500));
          if (upstream.status === 429) {
            return Response.json(
              { error: "AI rate limit reached. Please try again shortly." },
              { status: 429 },
            );
          }
          if (upstream.status === 401 || upstream.status === 402 || upstream.status === 403) {
            return Response.json({ error: "Server AI is unavailable right now." }, { status: 402 });
          }
          return Response.json({ error: "AI request failed" }, { status: 502 });
        }

        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          return Response.json({ error: "Bad upstream response" }, { status: 502 });
        }
        const respParts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
        const imgPart = respParts.find((p) => p?.inline_data?.data || p?.inlineData?.data);
        const inline = imgPart?.inline_data ?? imgPart?.inlineData;
        if (!inline?.data) {
          return Response.json({ error: "No image returned by AI" }, { status: 502 });
        }
        const mime = inline.mime_type ?? inline.mimeType ?? "image/png";
        return Response.json({ image: `data:${mime};base64,${inline.data}` });
      },
    },
  },
});
