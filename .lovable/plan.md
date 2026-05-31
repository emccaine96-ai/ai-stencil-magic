Goal

Ship two big upgrades to the stencil workspace in one pass, without breaking what already works:

1. Replace the post-generation editing panel with a real 10-knob real-time canvas engine, add a 3D Tonal Map overlay, add 3 pre-generation shading filter buttons, and add a Saved Generations / Storage Vault to the top menu.
2. Add a "Master Color & Studio Suite" dropdown (top-right) with a 4K Lanczos upscaler, k-means + Delta-E ink reconciliation, interactive color wheel with mixing recipes & harmonies, and a Three.js "Try It On 3D" skin viewport.

Everything client-side, no extra backend calls, purple ink color `#A855F7` preserved.

## Scope by section

### A. Storage Vault (new route + auto-save)

- New `src/lib/vault.ts` wrapping IndexedDB (no extra deps — native `indexedDB`) with `saveStencil({photo, stencil, params})`, `listStencils()`, `getStencil(id)`, `deleteStencil(id)`. Persists across reboots.
- Hook into `generate()` in `create.tsx`: as soon as `setStencil(...)` fires, also `vault.saveStencil(...)` in the background. No user action required.
- New route `src/routes/vault.tsx` → "Saved Generations / Storage Vault" grid: thumbnail, timestamp, style, "Open in editor", "Download", "Delete". Loads via TanStack Query.
- Make storage accessable from the main drop-down menu whe you find the other options the dogs and dont the and how it works and exetera.. add the storage in that menu don't merge or anything just add that extra option for storage in that menu drop-down 

### B. 10-knob real-time editor (replaces current "Edit stencil" panel)

- Rewrite `postProcessStencil` into a `composeStencil(srcStencilImageData, knobs): ImageData` pipeline running fully in the browser. All knobs map exactly 0–100:
  1. Contrast / Threshold — luminance cutoff → ink vs white.
  2. Line thickness — morphological erode (thicken) / dilate (thin) on a binary mask; kernel radius 0–5px.
  3. Detail density — Sobel magnitude threshold; lower threshold = more edges.
  4. Noise reduction — separable Gaussian blur on source before edges; radius 0–8px.
  5. Shadow depth — gamma curve on dark luminances (<30%).
  6. Midtone boost — Bezier curve on 33–66% luminance band.
  7. Highlights suppression — clamp/compress >80% luminance.
  8. Fine line sharpness — unsharp mask `[0,-1,0;-1,5,-1;0,-1,0]` blended by slider.
  9. Paper grain — generated seamless noise overlay, alpha 0–0.4.

10. Thermal intensity — leave this step out unless it was gonna make my app have better quality they worked but if what you had on this step made those sliders better than they are do it if it was gonna downgrade them don't those two were the only sliders that worked only change if it upgrade them just

### C. 3D Tonal Map Guide overlay

- New toggle button "3D Tonal Map Guide" above the preview. When ON, render the stencil layer *unchanged* and stack a transparent overlay:
  - Compute luminance from the *original photo*, segment into Dark / Mid / Light via 2 Otsu thresholds.
  - Marching-squares contour the boundaries between zones.
  - Draw dashed strokes: Dark→Mid = `#B91C1C`, Mid→Light = `#F97316`, Light→Highlight = `#FACC15`.
- Implementation in `src/lib/tonal-map.ts`, drawn into a separate canvas layered with `pointer-events: none`.

### D. 3 pre-generation shading filter buttons

- Above the Generate button: "Whip", "Pendulum", "Stipple" toggle row (plus "None" default). Selection is appended to the generation prompt AND applied as a post-pass to the returned stencil so behavior is consistent regardless of model output.
- Whip → directional exponential-scatter dot field from shadow boundaries.
- Pendulum → U-curve density distribution across midtones.
- Stipple → blue-noise dithering replacing gray gradients with dot field.

### E. Master Color & Studio Suite dropdown (top-right of `/create`)

Single elegant collapsible panel with 4 sub-tools:

1. **Image Upscaler** — uses existing `src/lib/lanczos.worker.ts`. UI: dimension preview, target (2K/4K), progress bar, add download upscale option in a small button on the bottom of  upload canvas not inside make it look professional  don't replace upload . 4K max (3840×2160) — true 8K refused with a clear message because it exceeds browser memory in practice.
2. **Ink Inventory** — uses existing `src/lib/ink-library.ts`. Runs k-means on the uploaded photo, shows 5–10 dominant colors as ink-cap chips with "Brand — Name (#hex)" + ΔE.
3. **Color Wheel + Mixing** — HSL wheel canvas, click any hue → opens drawer with `mixRecipe(hex)` percentages. Harmony tabs (Complementary, Triadic, Split-Complementary, Analogous) draw overlays on the wheel.
4. **Try It On 3D** — Three.js scene with neutral cylindrical body parts (forearm, bicep, calf, chest) loaded as procedural meshes (no external GLB to keep bundle small), stencil projected as a texture with `MultiplyBlending`. Orbit controls. Lazy-loaded so Three.js (~500KB) doesn't load on first paint.

### F. Architecture / safety

- All new modules pure client-side. No new server functions.
- Lazy-load heavy modules (Three.js viewport, color wheel) via `React.lazy` so the create-page initial bundle stays small.
- `processedUrl` regeneration runs in a single `useEffect` with `AbortController`-like cancellation flag to prevent leaks on rapid slider drags.

## Files

Created:

- `src/lib/vault.ts` — IndexedDB wrapper
- `src/lib/edit-pipeline.ts` — 10-knob canvas pipeline
- `src/lib/tonal-map.ts` — 3-zone contour overlay
- `src/lib/shading-filters.ts` — whip / pendulum / stipple
- `src/routes/vault.tsx` — Storage Vault page
- `src/components/master-suite/MasterSuite.tsx` — dropdown shell
- `src/components/master-suite/Upscaler.tsx`
- `src/components/master-suite/InkInventory.tsx`
- `src/components/master-suite/ColorWheel.tsx`
- `src/components/master-suite/SkinViewport.tsx` (lazy)

Edited:

- `src/routes/create.tsx` — wire new editor, vault auto-save, suite dropdown, shading filter buttons, tonal map toggle
- `src/routes/index.tsx` and `src/routes/create.tsx` headers — add Vault nav link

Already in place from previous turn: `src/lib/lanczos.worker.ts`, `src/lib/ink-library.ts`, `three` + `@types/three` installed.

## Known trade-offs / things to confirm

- **True 8K upscaling**: I'll cap at 4K (3840×2160). Browsers run out of memory above this for the intermediate float buffer (~256MB for 8K). I'll show a tooltip explaining this.
- **3D viewport models**: Procedural cylindrical/capsule meshes (no external GLB) — fast, no asset hosting, but stylized. If you want photoreal models later we'd need to host GLBs. Make and option for this 
- **Suite dropdown placement on mobile**: Top-right dropdown will become a full-width sheet under 640px to remain usable.
- **Per-knob CPU cost**: At 1024px working size, full 10-knob pipeline runs in ~80–200ms on a midrange laptop — fine for sliders with the 60ms debounce; might feel a touch heavy on phones for the heaviest knobs (Gaussian r=8, unsharp at full strength). Acceptable? Don't take nothing out that is in my app now or change any currently working features. only change unworking things and add what I asked to add don't downgrade my app any or change anything in it add three new filter as described alongside current filter don't take any of them out please 
- The apps results and features are lovely so I need them all only add what I need and fix top advanced editing sliders in the drop-down menu 