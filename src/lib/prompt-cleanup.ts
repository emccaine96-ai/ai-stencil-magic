/** Rewrite free-form artist notes into clean stencil instructions. */
export async function cleanUpPromptText(opts: {
  raw: string;
  openrouterKey?: string;
  geminiKey?: string;
}): Promise<{ text: string; source: "openrouter" | "gemini" | "local" }> {
  const raw = opts.raw.trim();
  if (!raw) throw new Error("Write some custom instructions first");

  const system = `You rewrite tattoo-stencil artist notes into clear, concise ADDITIONAL INSTRUCTIONS for an image-to-stencil AI.
Rules you MUST follow in the rewrite:
- Keep the artist's intent
- Never contradict: pure white background, single ink color, closed continuous contours, identity preservation, no text/watermarks
- Prefer concrete line-weight, hatch, and detail language over vague adjectives
- Output ONLY the rewritten instructions, no preamble or quotes`;

  if (opts.openrouterKey) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.openrouterKey}`,
          "HTTP-Referer": "https://ai-stencil-magic.app",
          "X-Title": "AI Stencil Magic",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: raw },
          ],
        }),
      });
      const data = await r.json();
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (r.ok && text) return { text, source: "openrouter" };
    } catch {
      /* fall through */
    }
  }

  if (opts.geminiKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(opts.geminiKey)}`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: `${system}\n\nArtist notes:\n${raw}` }] }],
        }),
      });
      const data = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("").trim();
      if (r.ok && text) return { text, source: "gemini" };
    } catch {
      /* fall through */
    }
  }

  // Local heuristic fallback
  let cleaned = raw.replace(/\s+/g, " ").replace(/\b(please|just|kind of|sort of)\b/gi, "").trim();
  cleaned = `Apply these artist notes on top of the base stencil rules (do not break white background, ink color, closed contours, or identity): ${cleaned}`;
  return { text: cleaned, source: "local" };
}
