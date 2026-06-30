# Phase 7 — Vault Editor Pro Overhaul

Goal: make `VaultProcreateEditor` a top-tier tattoo stencil editor with reliable Vault persistence. No changes to `/create` except a tiny save-confirmation hook.

## 1. Persistence bugs (highest priority)

**src/lib/vault.ts (`saveStencil`)**
- Make it awaitable + return the new `DocumentData` (already does, but callers in `create.tsx` may not await). Add a `try/catch` with a console + toast hook.
- Add `listDocuments` re-export so vault page can refresh after save without a stale read.

**src/routes/create.tsx**
- Minimal hook: ensure `await saveStencil(...)` resolves before navigating; show a toast "Saved to Vault" on success and "Save failed" on error. No other changes.

**src/routes/vault.tsx**
- On mount + on `visibilitychange` + on `focus`, re-run `listDocuments()` so a freshly generated stencil shows up.

**src/lib/localDB.ts**
- Add `getDocumentWithLayers(id)` that returns `{ doc, editorState }` with safe JSON parse + schema migration fallback.
- Add `saveEditorState(id, editorState, thumbnail?)` that stringifies + bumps `lastEdited` (used by autosave).

## 2. Worker offload for heavy ops

**src/lib/editor-worker.ts (new)** — Web Worker handling:
- `threshold` (stencil optimizer)
- `morphology` (erode/dilate cleanup)
- `stipple` density map
- `liquify` mesh warp pass
- `smudge` sample/blur
- `tonalMap3D` (reuses shading-filters logic)

Main thread posts `{ op, imageBitmap, params }` and receives an `ImageBitmap` back via `transferControlToOffscreen`-free path (worker creates bitmap, transfers). Falls back to in-thread if `Worker`/`OffscreenCanvas` missing.

**src/lib/worker-bridge.ts (new)** — Thin promise wrapper around the worker with op id correlation + AbortController.

## 3. Layered canvas architecture

**src/components/vault/VaultProcreateEditor.tsx** — refactored, not nuked:
- One `<canvas>` per `LayerState` stacked absolutely; composited only when exporting/saving.
- Active layer receives pointer events; others are `pointer-events: none`.
- `LayerPanel` (right drawer): add/duplicate/delete/reorder, opacity, blend mode dropdown (16 modes from `localDB.BlendMode`), visibility, lock, alpha-lock, clip-to-below.
- Reference layer = Layer 0 (existing image drop), now becomes a `LayerState` with `name: "Reference"` + `locked: true` by default.
- Onion skin toggle: shows previous undo snapshot of active layer at 30% under live strokes.

## 4. Stroke pipeline perf

- Replace per-move `getImageData` paths with a **draw queue** flushed inside a single `requestAnimationFrame`.
- Stabilizer (EMA) and predictive Bézier stay on main thread but emit batched stamp arrays (no per-stamp ctx state changes — set `globalAlpha`/`fillStyle` once per flush).
- Stamp cache from `brush-worker-render.getStamp` reused; ensure cache key includes flow + jitter.
- Pressure simulation fallback for mouse: velocity-based pressure curve `p = clamp(1 - speed/maxSpeed, 0.2, 1)`.
- Symmetry engine reuses the same flushed stamp batch (mirror by matrix, not by re-rendering).

## 5. Pro tattoo tools

- **Stencil Optimizer** button (top toolbar): worker `threshold` (Otsu) + `morphology` open/close → clean 1-bit lines.
- **Line Taper**: stroke post-process that scales alpha/width by t at stroke ends (already partly in brushes; expose as toggle).
- **Needle Sim presets**: 3RL, 5RL, 9RL, 7M1, 13M1 — preset brushes wired into the existing 500-library under a "Needle Sim" category.
- **Dot Density Map**: worker generates stipple pattern from the reference layer's luminance, paints into active layer.
- **Skin Texture Overlay**: subtle pore noise layer at 8% multiply, toggleable.
- **3D Tonal Map**: reuses `src/lib/tonal-map.ts` via worker.

## 6. Export

Top-toolbar Export menu:
- PNG (transparent, current zoom)
- PNG 4K (upscale via Lanczos worker we already have)
- PDF stencil sheet (reuse `pdf-export.ts`)
- PSD (reuse `psd-export.ts`) with current layer stack

## 7. Autosave + restore

- `useAutosave(docId, getEditorState)` hook: debounced 3s + on `visibilitychange` + on `beforeunload`.
- Calls `saveEditorState` and regenerates a small thumbnail (`makeThumbnail` of composited PNG every 30s max).
- On open, `getDocumentWithLayers` rehydrates every layer's `dataUrl` into its canvas.

## 8. UI/UX polish

- Floating panels stay closed by default (already fixed). Add a thin status pill bottom-center with: zoom %, active layer name, autosave state ("Saved · 2s ago").
- Error boundary around the editor: catches a thrown render and shows "Editor crashed — your work is autosaved. Reload?" with a Reload button.
- Loading skeleton while `getDocumentWithLayers` resolves.

## Technical notes (for review)

- Worker built as a standard `new Worker(new URL("./editor-worker.ts", import.meta.url), { type: "module" })` — Vite handles it.
- All worker ops are pure functions of `(ImageData, params) → ImageData` so they're trivially testable.
- Layered canvas memory: at 4096² × 4 bytes × N layers we cap at 8 layers visible; older layers get rasterized into a "Background" merge when limit hit (with undo entry).
- Purple ink `#A855F7` preserved across UI accents; only canvas pixel data is user-controlled.
- No changes to `/create` other than awaited save + toast.

## Out of scope (this phase)

- CRDT collab UI (engine already exists, no UI wiring this round).
- Plugin SDK runtime.
- Cloud sync of layers (stays local IndexedDB).

Confirm and I'll ship it.
