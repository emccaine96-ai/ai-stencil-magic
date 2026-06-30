# Use only Gemini API key

The stencil generator (`src/routes/api/generate-stencil.ts`) already uses `GEMINI_API_KEY` — **not touched**.

The only remaining Lovable-key dependency is the AI Co-Pilot edit endpoint.

## Change

**`src/routes/api/ai-copilot.ts`** — rewrite handler to call Gemini directly (same pattern as `generate-stencil.ts`):
- Read `process.env.GEMINI_API_KEY` (remove all `LOVABLE_API_KEY` references).
- POST to `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=...`.
- Convert the incoming `image` / `reference` data URLs into `inline_data { mime_type, data }` parts alongside the prompt text.
- Request `responseModalities: ["IMAGE","TEXT"]`.
- Parse `candidates[0].content.parts[].inline_data` and return `{ image: "data:<mime>;base64,<data>" }` so `AICopilotModal.tsx` keeps working unchanged.
- Map upstream 429 → 429, 401/403 → 402-style "key invalid/quota" message so the existing modal error UI still renders correctly.

No other files change. No client changes. Stencil generator untouched.
