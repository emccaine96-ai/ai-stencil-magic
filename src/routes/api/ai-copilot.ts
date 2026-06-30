import { createFileRoute } from "@tanstack/react-router";

type Body = {
  prompt: string;
  image?: string;       // dataURL of current canvas (for edits)
  reference?: string;   // optional second image (style transfer source)
};

function parseDataUrl(url: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(url);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

export const Route = createFileRoute("/api/ai-copilot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.GEMINI_API_KEY;
        if (!key) return Response.json({ error: "Missing GEMINI_API_KEY" }, { status: 500 });
        let body: Body;
        try { body = (await request.json()) as Body; }
        catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
        if (!body.prompt || body.prompt.length > 2000) {
          return Response.json({ error: "Invalid prompt" }, { status: 400 });
        }

        const parts: any[] = [{ text: body.prompt }];
        for (const src of [body.image, body.reference]) {
          if (!src) continue;
          const parsed = parseDataUrl(src);
          if (parsed) parts.push({ inline_data: { mime_type: parsed.mimeType, data: parsed.data } });
        }

        const upstream = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${encodeURIComponent(key)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts }],
              generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
            }),
          },
        );

        const text = await upstream.text();
        if (!upstream.ok) {
          if (upstream.status === 429) {
            return Response.json({ error: "Gemini API rate limit reached. Please try again shortly." }, { status: 429 });
          }
          if (upstream.status === 401 || upstream.status === 402 || upstream.status === 403) {
            return Response.json({ error: "Gemini API key invalid or quota exhausted." }, { status: 402 });
          }
          return Response.json({ error: text || `Upstream error ${upstream.status}` }, { status: upstream.status });
        }

        let data: any;
        try { data = JSON.parse(text); } catch { return Response.json({ error: "Bad upstream response" }, { status: 502 }); }
        const respParts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
        const imgPart = respParts.find((p) => p?.inline_data?.data || p?.inlineData?.data);
        const inline = imgPart?.inline_data ?? imgPart?.inlineData;
        if (!inline?.data) {
          return Response.json({ error: "No image returned by Gemini" }, { status: 502 });
        }
        const mime = inline.mime_type ?? inline.mimeType ?? "image/png";
        return Response.json({ image: `data:${mime};base64,${inline.data}` });
      },
    },
  },
});