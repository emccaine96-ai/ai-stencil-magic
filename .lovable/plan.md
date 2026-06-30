# Vault Editor — Picsart-First Refactor + Code Audit

**Untouched:** `/create` stencil generation page, `src/routes/api/generate-stencil.ts`, the AI generation pipeline, and the `/create` UI. All changes are scoped to the Vault editor and its helpers.

## 1. New default UI: Picsart-style, all tools visible

Replace the current "panels-popping-out-on-touch" behavior with a fixed, always-visible Picsart-style layout:

```text
 ┌────────────────────────────────────────────────┐
 │  Top bar: Close · Undo · Redo · Title · Save   │
 ├────────────────────────────────────────────────┤
 │                                                │
 │              CANVAS (full bleed)               │
 │                                                │
 ├────────────────────────────────────────────────┤
 │  Bottom dock (horizontal scroll, always on):   │
 │  Draw · Effects · Adjust · Retouch · Crop ·    │
 │  Text · Filters · AI · Upscale · Export …      │
 └────────────────────────────────────────────────┘
```

- Remove the two collapsible side drawers from the default Vault view.
- Every Picsart category opens as a small bottom sheet above the dock (not a fullscreen overlay).
- All tools have visible labels + icons, no hidden gestures required.

## 2. "Draw" mode = the Procreate experience

The Procreate-themed columns (500-brush picker, layers, symmetry, stabilizer, elite tools, color wheel) are NOT removed — they're scoped to a single entry point:

- Tap **Draw** in the bottom dock → the dock collapses and the Procreate left + right drawers slide in (current behavior, but only here).
- Tap **Done** in the Draw header → drawers slide out, Picsart dock returns.
- All brush state, symmetry, elite tools, stabilizer remain available exactly as today, just gated behind Draw mode.

## 3. Autosave on/off toggle (prominent)

`AutosaveSettings` already exists but is buried in a drawer. Surface a simple **Autosave: On/Off** pill in the top bar next to the Save button, with a long-press to open the interval picker. Toggle persists via existing `useAutosavePrefs`.

## 4. Picsart tool audit — make each one actually work

Walk every entry in `PicsartDock` and confirm the handler is (a) wired, (b) calls a real implementation in `picsart-filters.ts` or the worker, (c) pushes an undo snapshot, (d) marks autosave dirty. Fix any stubs.

Known gaps to fix:

- Crop tool: currently no interactive crop rect — add a draggable crop overlay with aspect presets.
- Text tool: curved text exists but the commit path doesn't push undo on some branches.
- Heal: confirm the patch-blend wiring from the last pass works on both selection and global modes.
- Dispersion / Lens Flare / Tilt-Shift: verify they snapshot before mutating so Undo restores cleanly.
- Remove Background: pair with the worker's Otsu path, not the main-thread fallback, on mobile.
- Geometry (flip / rotate): make sure rotate90 resizes the backing canvas + repositions layers.

## 5. Canvas engine audit

Go through `VaultProcreateEditor.tsx` end-to-end and fix:

- Any `useEffect` with stale refs / missing deps that cause the canvas to re-init mid-stroke.
- The RAF draw loop — confirm `pendingDraw` is always flushed on pointerup so the last sample isn't dropped.
- Pinch-zoom anchor math — verify no drift after rapid two-finger gestures.
- Reference layer transform: confirm drag/scale/rotate handles persist across autosave reload.
- IndexedDB save: verify both the flattened thumbnail AND `layeredEditorData` write atomically; add a single retry on `QuotaExceededError` with a clear toast.
- Remove dead code paths left over from the drawer-based UI (unused state, refs, handlers).

## 6. File changes

- `src/components/vault/VaultProcreateEditor.tsx` — replace shell with Picsart layout + Draw-mode toggle; keep all draw engine code intact.
- `src/components/vault/PicsartDock.tsx` — add Draw entry, audit every handler.
- `src/components/vault/DrawModeOverlay.tsx` *(new)* — thin wrapper that mounts the existing Procreate left/right drawers when Draw mode is active.
- `src/components/vault/CropOverlay.tsx` *(new)* — interactive crop rect with aspect presets.
- `src/lib/picsart-filters.ts` — fill in any missing ops, ensure each returns/commits cleanly.
- `src/components/vault/AutosaveToggle.tsx` *(new)* — top-bar pill + long-press popover.

## 7. What I will explicitly NOT touch

- `src/routes/create.tsx`
- `src/routes/api/generate-stencil.ts`
- Any file under the stencil-generation pipeline (`stencil-filters.ts` stays as-is unless an editor handler imports it).
- `/studio` route (Procreate standalone editor stays as it is).

## 8. Verification

After the refactor I will:

1. Build extremely clean.
2. Open the Vault editor and tap every dock category — confirm each tool runs and works flawlessly and undo works.
3. Toggle autosave off, draw, close — confirm no save fires. Toggle on, draw, wait interval — confirm save fires.
4. Enter Draw mode → draw with 3 brushes + symmetry → exit Draw mode → confirm strokes persist and dock returns.

- If you want to add/remove anything from the dock categories, tell me now; otherwise I'll keep the current 20 categories and just make them all work. I will upgrade and make sure your satisfied I will use my max capabilities and do my very best I will not make even one mistake I will fix all errors and ensure they all are exceptional and meet you expectations 

&nbsp;