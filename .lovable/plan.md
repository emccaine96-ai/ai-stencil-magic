## Goal be sure not to downgrade by no means my stencil generating page is perfect don't break or change that part in any way shape or form this is purely for smother use on mobile and tablets devices do not break or downgrade only improvements 

&nbsp;

Give the Vault editor user control over autosave, and tighten the whole app for Android phones (Pixel, Galaxy) and tablets.

## 1. Autosave controls (VaultProcreateEditor)

Add a small **Autosave** card inside the right-drawer Settings panel (above the existing tool list):

- **Toggle**: "Autosave" on/off (default on).
- **Interval radio chips** (disabled when toggle is off): `5 min`, `10 min`, `15 min`. Default 5.
- **Status line**: "Saved · 12s ago" / "Off" / "Saving…".
- **Manual Save button** always visible (works regardless of toggle).

Persist both values in `localStorage` under `pp.autosave.enabled` and `pp.autosave.intervalMs` so the choice survives reloads and applies to every document.

Replace the current 3-second debounced autosave with an interval-based scheduler:

- If enabled, run `saveEditorState` every N minutes AND on `visibilitychange`/`beforeunload` (safety net, regardless of toggle so work is never lost on tab close).
- If disabled, only the safety-net save on `beforeunload` runs; no periodic writes.
- Status pill at the bottom reflects the new state ("Autosave off" when disabled).

## 2. Mobile optimization (Pixel / Galaxy / tablets)

Scope: editor + the high-traffic routes (`/`, `/vault`, `/create`, `/help`). No business-logic changes.

**Global**

- Add `viewport-fit=cover` + `interactive-widget=resizes-content` to the root `<meta name="viewport">` so the URL bar collapse on Chrome Android doesn't reflow the canvas.
- Add `overscroll-behavior: none` and `touch-action: manipulation` on `html/body` in `src/styles.css` to kill pull-to-refresh and 300ms tap delay on the editor shell.
- Respect `env(safe-area-inset-*)` on fixed bars (already partially done in `MobileToolbar`; extend to vault editor header + status pill).
- Add `@media (hover: none)` rules so hover-only affordances (tooltips, hover-fade Procreate mode) don't get stuck visible on touch.

**VaultProcreateEditor — mobile layout pass**

- Detect `useIsMobile()` (already exists) and switch behavior:
  - Drawers become **bottom sheets** with a drag handle instead of side drawers; max-height 70vh; backdrop scrim.
  - Header collapses into a single icon row + overflow `⋯` menu (Size / Pro / Adjust / History live in the overflow).
  - Status pill moves above the bottom safe-area inset.
  - Edge dock tabs grow to 44×56 (current 32×48) to meet Android touch-target guidance.
  - Brush picker grid becomes 3 columns on phones, 5 on tablets.
- Cap canvas backing-store size by device: phones ≤ 3072², tablets ≤ 4096², 6K upscale shows an explicit memory warning + confirm on devices reporting `navigator.deviceMemory < 6`.
- Throttle the predictive-stroke flush to one per `requestAnimationFrame` (already done) and skip thumbnail regeneration while `isInteracting` is true.
- Use `PointerEvent.coalescedEvents` when present for smoother strokes on Pixel/Galaxy where the digitizer batches.
- Tablet breakpoint (≥ 900px portrait, ≥ 1180px landscape): keep side drawers but narrower (264px) and allow both open simultaneously.

**Other routes**

- `/vault`: grid switches to 2 cols on phones, 3 on small tablets, 4 on large tablets. Cards get larger tap targets and a long-press menu.
- `/create`: form controls min-height 44px; sticky generate button above the safe-area inset; collapse advanced options behind an accordion on phones.
- `/help`: typography scaled with `clamp()`; sidebar TOC becomes a top sticky select on phones.

**Performance**

- Lazy-load the heavy editor route chunk (already a separate route file; verify no eager imports from `index.tsx`).
- Add `content-visibility: auto` to vault grid cards for fast scroll on long libraries.

## 3. Out of scope

- No backend, schema, or `/create` generation logic changes (only layout/spacing).
- No new brushes, filters, or export formats.
- No design-token color changes; purple ink `#A855F7` preserved.

## Technical notes

- New file: `src/hooks/use-autosave-prefs.ts` — reads/writes the two `localStorage` keys, returns `{ enabled, intervalMs, setEnabled, setIntervalMs }`.
- New file: `src/components/vault/AutosaveSettings.tsx` — the toggle + chips card, consumed by the right drawer.
- Edit: `src/components/vault/VaultProcreateEditor.tsx` — swap debounced effect for interval scheduler; add mobile layout branches via `useIsMobile()`; add coalesced-event handling in the pointer-move handler.
- Edit: `src/styles.css` — global mobile rules.
- Edit: `src/routes/__root.tsx` — viewport meta.
- Edit: `src/routes/vault.tsx`, `src/routes/create.tsx`, `src/routes/help.tsx` — responsive class passes only.
- Tablet detection: extend `use-mobile.tsx` with a `useIsTablet()` companion (≥768 and ≤1180, coarse pointer).