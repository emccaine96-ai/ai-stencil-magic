
## Deliverable 1 — Lovable web app (pixel-faithful Stencil AI clone)

**Stack:** TanStack Start + Tailwind + shadcn, Lovable AI Gateway for image generation (Nano Banana 2 = `google/gemini-3.1-flash-image-preview`).

**Pages / routes**
- `/` — landing: sticky header (script "Stencil AI" wordmark + neon-purple P logo, "Sign In", hamburger), purple "Get StencilAI on Google Play" banner, hero "Turn any photo into a **perfect stencil** in 30 seconds" with purple gradient on accent words, stats row (1,000+ / 20+ / < 30 sec), purple pill "Create Stencil →", horizontal scroll of sample stencils, "How it works" 3-step (Upload / Choose Your Style / Print Your Stencil) with numbered purple badge icons, "How to Get Best Results" carousel with DO/DON'T cards, "See Your Stencil Come to Life" before/after slider with Hatching / Solid tabs, FAQ, footer.
- `/create` — upload → choose style (Hatching, Solid, Dotwork, Hybrid) → tonal sliders (highlights / light / mid / dark / shadow density) → generate → before/after slider → download PNG.

**Stencil generation pipeline (server function `src/lib/stencil.functions.ts`)**
1. Receive uploaded photo (base64).
2. Call Lovable AI Gateway image model `google/gemini-3.1-flash-image-preview` (Nano Banana 2) with a tonal-mapping prompt that explicitly instructs 5 tonal tiers → line treatment:
   - **Deep shadows** → dense cross-hatching (3 overlaid hatch directions)
   - **Dark mid-tones** → double cross-hatch (2 directions)
   - **Mid-tones** → single-direction parallel hatching
   - **Light mid-tones** → sparse stippling / dot work
   - **Highlights** → pure white, no marks
   - Style switch (Hatching / Solid / Dotwork / Hybrid) rewrites the per-tier treatment.
   - Always purple ink (#A855F7) on white, tattoo-stencil ready, clean closed contours, no gray fills.
3. Stream back the generated PNG as base64; show in before/after slider.

**Design tokens (src/styles.css)**
- bg `oklch(0.08 0.02 290)` near-black with subtle violet
- primary `oklch(0.62 0.27 300)` neon purple
- accent gradient: violet → magenta
- font: "Dancing Script" / "Great Vibes" for wordmark, Inter for body
- rounded-full pills, soft glow shadows on primary buttons

**Files to create**
- `src/styles.css` — tokens
- `src/routes/index.tsx` — landing
- `src/routes/create.tsx` — generator
- `src/components/site/{Header,Hero,Stats,HowItWorks,BestResults,BeforeAfter,Faq,Footer,StencilLogo}.tsx`
- `src/lib/ai-gateway.server.ts` — Lovable AI provider helper
- `src/lib/stencil.functions.ts` — server fn calling Nano Banana 2
- `src/routes/api/stencil.ts` — alt streaming route if needed
- generated logo asset under `src/assets/`

**Secrets:** `LOVABLE_API_KEY` (auto-provisioned via Lovable AI gateway enablement).

---

## Deliverable 2 — Kaggle notebook (`/mnt/documents/stencil_ai_kaggle.ipynb`)

Cleaned + advanced version of the prior PyTorch script, fully runnable on Kaggle (GPU T4):

- **All 10 prior fixes** retained (joint augmentation, BCEWithLogits, AMP, val split, checkpoint save/load, etc.)
- **New: 5-channel tonal output head** (highlight, light, mid, dark, shadow) instead of 3-channel.
- **Mathematical tonal layer mapping** via luminance histogram equalization + Otsu multi-level thresholding to derive ground-truth tonal masks automatically from grayscale targets (so users only need image+grayscale-stencil pairs, not 5 hand-drawn masks).
- **Advanced renderer** `render_stencil_layered()`:
  - Per-tier hatch direction & spacing (shadows: 3 directions @ 2px, dark-mid: 2 dirs @ 3px, mid: 1 dir @ 4px, light: stipple density 0.15, highlight: blank)
  - Style modes: `hatching`, `solid`, `dotwork`, `hybrid`
  - Anti-aliased line drawing via `cv2.line` with `LINE_AA`
  - Optional 3D face-normal estimation (using `mediapipe` face mesh) to align hatch direction with surface curvature — "face mesh 3D mathematical layering"
- **Inference cell**: upload photo → predict 5 tonal masks → render → display + save PNG.
- **Optional Nano Banana cell**: if user provides a Gemini API key, call `gemini-2.5-flash-image` as an alternative generator and compare side-by-side.
- Markdown sections explain the tonal math (Otsu, luminance bins, hatch-density = f(tone_value)).

---

## Order of work
1. Enable Lovable Cloud / AI Gateway (needed for `LOVABLE_API_KEY`).
2. Generate brand logo asset (neon purple script "P").
3. Build design tokens + landing page components.
4. Build `/create` page + server fn calling Nano Banana 2.
5. Write Kaggle notebook to `/mnt/documents/stencil_ai_kaggle.ipynb` and expose as artifact.
6. Verify build, test generation flow end-to-end.
