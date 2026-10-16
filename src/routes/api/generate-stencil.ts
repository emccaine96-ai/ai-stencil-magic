import { createFileRoute } from "@tanstack/react-router";
import { bodyLimit, H3Event, HTTPError } from "h3";

type Body = {
  prompt: string;
  image: { mimeType: string; data: string };
  images?: { mimeType: string; data: string }[];
  provider?: "openrouter" | "gemini";
  openrouterKey?: string; // client-supplied key for Master Pro tier
  model?: string; // client-supplied model override for OpenRouter
};

const MAX_PROMPT_CHARS = 8000;
const MAX_IMAGE_B64_CHARS = 14_000_000; // ~10 MB decoded per image
const MAX_IMAGES = 3;
// Primary image plus all extra images, with room for the prompt and JSON metadata.
const MAX_REQUEST_BODY_BYTES = MAX_IMAGE_B64_CHARS * (MAX_IMAGES + 1) + 64 * 1024;
const limitStencilBody = bodyLimit(MAX_REQUEST_BODY_BYTES);
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const DEFAULT_OR_MODEL = "google/gemini-2.5-flash-image";
// OpenRouter model ids look like "vendor/name" (optionally ":variant"). Anything else is rejected
// so a client can't push arbitrary strings into the upstream request.
const MODEL_ID_RE = /^[A-Za-z0-9][\w.-]{0,63}\/[A-Za-z0-9][\w.:-]{0,63}$/;

type Img = { mimeType: string; data: string };

/**
 * Check for an allowed MIME type and a nonempty image data string within the size limit.
 * This checks payload shape and length; it does not decode or validate the image bytes.
 */
function isValidImage(img: unknown): img is Img {
  if (!img || typeof img !== "object") return false;
  const i = img as Img;
  return (
    typeof i.mimeType === "string" &&
    ALLOWED_MIME.has(i.mimeType) &&
    typeof i.data === "string" &&
    i.data.length > 0 &&
    i.data.length <= MAX_IMAGE_B64_CHARS
  );
}

export const Route = createFileRoute("/api/generate-stencil")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Body;
        try {
          const event = new H3Event(request);
          body = (await limitStencilBody(event, () => event.req.json())) as Body;
        } catch (error) {
          if (HTTPError.isError(error) && error.status === 413) {
            return Response.json({ error: "Request body is too large" }, { status: 413 });
          }
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        if (!body?.prompt || typeof body.prompt !== "string" || !isValidImage(body?.image)) {
          return Response.json({ error: "prompt and image are required" }, { status: 400 });
        }
        if (body.prompt.length > MAX_PROMPT_CHARS) {
          return Response.json({ error: "prompt is too long" }, { status: 413 });
        }
        if (body.images !== undefined && !Array.isArray(body.images)) {
          return Response.json({ error: "invalid images payload" }, { status: 400 });
        }
        const extraImages = body.images ?? [];
        if (extraImages.length > MAX_IMAGES || !extraImages.every(isValidImage)) {
          return Response.json({ error: "invalid images payload" }, { status: 400 });
        }
        if (body.model !== undefined && (typeof body.model !== "string" || !MODEL_ID_RE.test(body.model))) {
          return Response.json({ error: "Invalid OpenRouter model id" }, { status: 400 });
        }

        const provider = body.provider || "openrouter";

        if (provider === "openrouter") {
          // OpenRouter: use client-supplied key or server env key
          const orKey = body.openrouterKey || process.env.OPENROUTER_API_KEY;
          if (!orKey) {
            return Response.json(
              { error: "Missing OpenRouter API key. Add your key in Settings or set OPENROUTER_API_KEY." },
              { status: 500 },
            );
          }

          // OpenRouter chat completions API with vision model.
          // Prefer body.images (hybrid: original + classical guide) when present;
          // fall back to the single body.image field for standard generation.
          const upstream = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${orKey}`,
                "HTTP-Referer": "https://ai-stencil-magic.app",
                "X-Title": "AI Stencil Magic",
              },
              body: JSON.stringify({
                model: body.model || DEFAULT_OR_MODEL,
                modalities: ["image", "text"],
                messages: [
                  {
                    role: "user",
                    content: [
                      { type: "text", text: body.prompt },
                      ...(extraImages.length > 0 ? extraImages : [body.image]).map(
                        (img) => ({
                          type: "image_url" as const,
                          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
                        }),
                      ),
                    ],
                  },
                ],
              }),
            },
          );

          if (!upstream.ok) {
            // Keep upstream bodies server-side; they can echo account or key details.
            const errText = await upstream.text().catch(() => "");
            console.error("[generate-stencil] OpenRouter error", upstream.status, errText.slice(0, 500));
            if (upstream.status === 429) {
              return Response.json(
                { error: "OpenRouter rate limit reached. Please try again." },
                { status: 429 },
              );
            }
            if (upstream.status === 401 || upstream.status === 403) {
              return Response.json(
                { error: "OpenRouter API key invalid. Check your key in Settings." },
                { status: upstream.status },
              );
            }
            return Response.json(
              { error: `OpenRouter error ${upstream.status}` },
              { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
            );
          }

          const data = await upstream.json();
          const message = data?.choices?.[0]?.message;

          // Primary path: OpenRouter's documented format for image-generating
          // models (including google/gemini-2.5-flash-image) returns the
          // generated image in message.images, NOT message.content — content
          // is typically just a plain text sentence with no image data in it.
          const images = message?.images;
          if (Array.isArray(images) && images.length > 0) {
            const url = images[0]?.image_url?.url ?? images[0]?.url;
            if (typeof url === "string" && url.length > 0) {
              return Response.json({ dataUrl: url });
            }
          }

          // Fallback paths below, kept as-is for models/providers that might
          // inline the image into content instead.
          const content = message?.content;
          if (typeof content === "string") {
            // Try to find base64 image data in the response
            const imgMatch = content.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
            if (imgMatch) {
              return Response.json({ dataUrl: imgMatch[0] });
            }
            // If no image, return the text as an error (OpenRouter text models don't generate images)
            return Response.json(
              { error: "OpenRouter model did not return an image. Use a vision-capable model." },
              { status: 502 },
            );
          }
          // Some image models return content as an array of parts
          if (Array.isArray(content)) {
            for (const part of content) {
              if (typeof part === "string") {
                const imgMatch = part.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=]+)/);
                if (imgMatch) return Response.json({ dataUrl: imgMatch[0] });
              }
              if (part?.type === "image_url" && part?.image_url?.url) {
                return Response.json({ dataUrl: part.image_url.url });
              }
              if (part?.inline_data?.data || part?.inlineData?.data) {
                const inline = part.inline_data ?? part.inlineData;
                const mime = inline.mime_type ?? inline.mimeType ?? "image/png";
                return Response.json({ dataUrl: `data:${mime};base64,${inline.data}` });
              }
            }
          }
          return Response.json(
            { error: "Unexpected OpenRouter response format" },
            { status: 502 },
          );
        }

        // Default: Gemini direct
        const key = process.env.GEMINI_API_KEY;
        if (!key) {
          return Response.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
        }

        // Key goes in a header, not the URL, so it stays out of access logs.
        const upstream = await fetch(
          "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent",
          {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-goog-api-key": key },
            body: JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts: [
                    { text: body.prompt },
                    { inline_data: { mime_type: body.image.mimeType, data: body.image.data } },
                  ],
                },
              ],
              generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
            }),
          },
        );

        const text = await upstream.text();
        if (!upstream.ok) {
          if (upstream.status === 429) {
            return Response.json(
              { error: "Gemini API rate limit reached. Please try again shortly." },
              { status: 429 },
            );
          }
          if (upstream.status === 402 || upstream.status === 403) {
            return Response.json(
              { error: "Gemini API key invalid or quota exhausted." },
              { status: upstream.status },
            );
          }
          console.error("[generate-stencil] Gemini error", upstream.status, text.slice(0, 500));
          return Response.json(
            { error: `Gemini error ${upstream.status}` },
            { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
          );
        }

        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          return Response.json({ error: "Bad upstream response" }, { status: 502 });
        }

        const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
        const imgPart = parts.find((p) => p?.inline_data?.data || p?.inlineData?.data);
        const inline = imgPart?.inline_data ?? imgPart?.inlineData;
        if (!inline?.data) {
          return Response.json({ error: "No image returned by Gemini" }, { status: 502 });
        }
        const mime = inline.mime_type ?? inline.mimeType ?? "image/png";
        return Response.json({ dataUrl: `data:${mime};base64,${inline.data}` });
      },
    },
  },
});
