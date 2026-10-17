# Touch-Up Tone Curve Patch

## Scope
Apply only the specified changes in these three files:

1. `src/components/touch-up/CurveEditor.tsx`
   - Remove only the square grid-line block.
   - Change only the default aspect ratio from square to `2.2/1`.
   - Preserve the diagonal guide, curve line, and draggable points.

2. `src/lib/touch-up/canvas-engine.ts`
   - Add `discardLastStroke()` immediately after `canRedo()`.

3. `src/routes/touch-up.tsx`
   - Add the two curve preview refs.
   - Replace the current one-shot curve application with open, live-preview, apply, and cancel functions.
   - Connect the Curves dock button to those functions.
   - Replace only the Curves sheet with the supplied compact floating panel.
   - Leave all other panels and tools unchanged.

## Verification
- Run the project typecheck and inspect preview diagnostics.
- Open Touch-Up Studio with a real saved stencil.
- Confirm visually that the compact curve panel leaves most of the stencil visible and has no grid squares.
- Exercise drag and preset live previews.
- Verify Cancel restores identical pixels without adding Undo history.
- Verify Apply keeps the preview and one Undo restores the prior pixels.
- Report exactly the three touched files and any verification limitation encountered.
