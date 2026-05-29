import { createFileRoute } from "@tanstack/react-router";

type Body = {
  prompt: string;
  image: { mimeType: string; data: string };
};

export const Route = createFileRoute("/api/generate-stencil")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return Response.json({ error: "Missing LOVABLE_API_KEY" }, { status: 500 });
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

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            modalities: ["image", "text"],
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: body.prompt },
                  {
                    type: "image_url",
                    image_url: {
                      url: `data:${body.image.mimeType};base64,${body.image.data}`,
                    },
                  },
                ],
              },
            ],
          }),
        });

        const text = await upstream.text();
        if (!upstream.ok) {
          if (upstream.status === 429) {
            return Response.json(
              { error: "Rate limit reached on Lovable AI. Please try again shortly." },
              { status: 429 },
            );
          }
          if (upstream.status === 402) {
            return Response.json(
              { error: "Lovable AI credits exhausted. Add credits in workspace settings." },
              { status: 402 },
            );
          }
          return Response.json({ error: text || `Upstream error ${upstream.status}` }, { status: upstream.status });
        }

        let data: any;
        try { data = JSON.parse(text); } catch { return Response.json({ error: "Bad upstream response" }, { status: 502 }); }

        const msg = data?.choices?.[0]?.message;
        const imgUrl: string | undefined =
          msg?.images?.[0]?.image_url?.url ?? msg?.images?.[0]?.url;
        if (!imgUrl) {
          return Response.json({ error: "No image returned by Lovable AI" }, { status: 502 });
        }
        return Response.json({ dataUrl: imgUrl });
      },
    },
  },
});