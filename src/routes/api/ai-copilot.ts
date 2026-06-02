import { createFileRoute } from "@tanstack/react-router";

type Body = {
  prompt: string;
  image?: string;       // dataURL of current canvas (for edits)
  reference?: string;   // optional second image (style transfer source)
};

export const Route = createFileRoute("/api/ai-copilot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        let body: Body;
        try { body = (await request.json()) as Body; }
        catch { return new Response("Invalid JSON", { status: 400 }); }
        if (!body.prompt || body.prompt.length > 2000) {
          return new Response("Invalid prompt", { status: 400 });
        }

        const content: any[] = [{ type: "text", text: body.prompt }];
        if (body.image) content.push({ type: "image_url", image_url: { url: body.image } });
        if (body.reference) content.push({ type: "image_url", image_url: { url: body.reference } });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            messages: [{ role: "user", content }],
            modalities: ["image", "text"],
          }),
        });

        if (!upstream.ok) {
          const text = await upstream.text();
          return new Response(text, { status: upstream.status });
        }
        const data = await upstream.json();
        const msg = data?.choices?.[0]?.message;
        const imgUrl: string | undefined =
          msg?.images?.[0]?.image_url?.url ??
          msg?.images?.[0]?.url ??
          (typeof msg?.content === "string"
            ? (msg.content.match(/data:image\/[^"'\s)]+/)?.[0])
            : undefined);
        if (!imgUrl) {
          return new Response(JSON.stringify({ error: "No image returned" }), { status: 502 });
        }
        return Response.json({ image: imgUrl });
      },
    },
  },
});