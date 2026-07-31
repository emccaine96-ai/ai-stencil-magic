import { createFileRoute } from "@tanstack/react-router";

type Body = {
  prompt: string;
  image: { mimeType: string; data: string };
};

export const Route = createFileRoute("/api/generate-stencil")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.GEMINI_API_KEY;
        if (!key) {
          return Response.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
        }
        let body: Body;
        try {
          body = (await request.json()) as Body;
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        if (!body?.prompt || !body?.image?.data || !body?.image?.mimeType) {
          return Response.json({ error: "prompt and image are required" }, { status: 400 });
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

        // Gemini native response: candidates[0].content.parts[].inline_data { mime_type, data }
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
