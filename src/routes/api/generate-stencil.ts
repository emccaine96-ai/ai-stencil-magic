import { createFileRoute } from "@tanstack/react-router";

type Body = {
  prompt: string;
  image: { mimeType: string; data: string };
  images?: { mimeType: string; data: string }[];
  provider?: "openrouter" | "gemini";
  openrouterKey?: string; // client-supplied key for Master Pro tier
  model?: string; // client-supplied model override for OpenRouter
};

export const Route = createFileRoute("/api/generate-stencil")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        if (!body?.prompt || !body?.image?.data || !body?.image?.mimeType) {
          return Response.json({ error: "prompt and image are required" }, { status: 400 });
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
                model: body.model || "google/gemini-2.5-flash-image",
                modalities: ["image", "text"],
                messages: [
                  {
                    role: "user",
                    content: [
                      { type: "text", text: body.prompt },
                      ...(body.images && body.images.length > 0 ? body.images : [body.image]).map(
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
            const errText = await upstream.text();
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
              { error: errText || `OpenRouter error ${upstream.status}` },
              { status: upstream.status },
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

        const upstream = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
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
          return Response.json(
            { error: text || `Upstream error ${upstream.status}` },
            { status: upstream.status },
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
