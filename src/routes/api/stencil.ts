import { createFileRoute } from "@tanstack/react-router";

type Body = {
  image: string; // data URL or base64
  style: "hatching" | "solid" | "dotwork" | "hybrid";
  intensity?: number; // 0..1 overall shading density
};

const STYLE_PROMPTS: Record<Body["style"], string> = {
  hatching:
    "Pure pen-and-ink crosshatching. Deep shadows use 3 overlaid hatch directions at ~45deg, 90deg, 135deg with dense line spacing. Dark mid-tones use 2 overlaid hatch directions. Mid-tones use single-direction parallel hatching. Light tones use very sparse parallel strokes. Highlights are pure white with no marks.",
  solid:
    "Clean bold solid line work, no shading fills. Use varying line weights only. Closed clean contours. Highlights are pure white.",
  dotwork:
    "Stippling / dotwork only. Deep shadows = very dense small dots. Dark mid-tones = medium dot density. Mid-tones = sparse dots. Light = very few dots. Highlights = pure white with no dots.",
  hybrid:
    "Combine bold solid contour lines with crosshatching in dark areas and stippling/dotwork in mid-to-light areas. Tonal hierarchy: shadows = crosshatch 3-directions, dark mids = crosshatch 2-directions, mids = single hatch or dense stipple, lights = sparse stipple, highlights = pure white.",
};

export const Route = createFileRoute("/api/stencil")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { image, style, intensity = 0.7 } = (await request.json()) as Body;
        const key = process.env.VITE\_GEMINI\_API\_KEY;\'
        if (!key) {
          return new Response(JSON.stringify({ error: "LOVABLE_API_KEY missing" }), {
            status: 500,
            headers: { "content-type": "application/json" },
          });
        }
        if (!image || !style) {
          return new Response(JSON.stringify({ error: "image and style are required" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }

        const styleBlock = STYLE_PROMPTS[style] ?? STYLE_PROMPTS.hatching;

        const prompt = `Convert this photo into a professional tattoo STENCIL line drawing, ready to transfer to skin.

HARD RULES:
- Output a single image on PURE WHITE background.
- All ink is the EXACT color #A855F7 (neon purple). No gray, no black, no other colors.
- Crystal-clear closed contour line work, tattoo-stencil ready.
- Preserve the subject's identity, proportions, facial features, hair flow, jewelry, and clothing details.
- Apply 3D face-mesh aware hatching: hatch direction should follow facial surface curvature (cheek, jawline, brow, nose bridge) like a sculptural sketch.

TONAL LAYERING (5 tiers, mapped from luminance):
1. Deep shadows (darkest 15%): densest mark-making.
2. Dark mid-tones: heavy mark-making.
3. Mid-tones: medium mark-making.
4. Light mid-tones: light mark-making.
5. Highlights (brightest 15%): pure white, untouched.

STYLE: ${style.toUpperCase()}
${styleBlock}

Overall shading density: ${Math.round(intensity * 100)}%.
No text, no watermarks, no signatures, no frame, no background scenery.`;

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Lovable-API-Key": key,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-image",
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: prompt },
                  { type: "image_url", image_url: { url: image } },
                ],
              },
            ],
            modalities: ["image", "text"],
          }),
        });

        if (!upstream.ok) {
          const text = await upstream.text();
          return new Response(
            JSON.stringify({ error: `Upstream ${upstream.status}: ${text.slice(0, 500)}` }),
            { status: upstream.status, headers: { "content-type": "application/json" } },
          );
        }

        const data = await upstream.json();
        // Try common shapes: choices[0].message.images[0].image_url.url
        let dataUrl: string | null = null;
        try {
          const msg = data?.choices?.[0]?.message;
          const imgs = msg?.images;
          if (Array.isArray(imgs) && imgs.length > 0) {
            const u = imgs[0]?.image_url?.url ?? imgs[0]?.url;
            if (typeof u === "string") dataUrl = u;
          }
          if (!dataUrl && Array.isArray(msg?.content)) {
            for (const part of msg.content) {
              if (part?.type === "image_url" && typeof part?.image_url?.url === "string") {
                dataUrl = part.image_url.url;
                break;
              }
            }
          }
        } catch {
          // ignore
        }

        if (!dataUrl) {
          return new Response(
            JSON.stringify({ error: "No image returned by model", raw: data }),
            { status: 502, headers: { "content-type": "application/json" } },
          );
        }

        return new Response(JSON.stringify({ image: dataUrl }), {
          headers: { "content-type": "application/json" },
        });
      },
    },
  },
});
