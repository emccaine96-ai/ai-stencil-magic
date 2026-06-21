# Device Test Checklist

Run these on each targeted device and report results in the PR comments. Capture a dev trace when you hit a problem.

Devices: Pixel 10a (Chrome/PWA), Galaxy S10, S20, S21, S22, S23, S24, S25, S26 (Chrome/Samsung Browser)

1) Basic gesture sanity
- Open app, create new canvas
- Use two-finger pinch to zoom in/out quickly and slowly
- Verify pinch center stays under fingers when fingers move or one finger lifts and re-enters
- Expected: No sudden jumps or recenters

2) Pan behavior
- With canvas zoomed, pan using one finger and with two fingers (when rotating) if supported
- Verify pan distance matches finger movement and does not under-pan by ~1/2

3) Stroke smoothness
- Draw continuous strokes at slow, medium, and fast speeds
- Expected: no skipped points, consistent width/spacing

4) Blank/black canvas stress
- Rapidly toggle brush + undo + autosave while drawing
- Wait 5s GC pause (simulate by opening devtools and pausing JS) to try reproduce
- Expected: no permanent blank/black canvas; recovery via redraw

5) GPU vs 2D fallback
- On a GPU-capable device with Chrome, verify GPU path engages (dev log shows "GPU brush path enabled")
- On a fallback device, verify Canvas2D rendering works and behavior is functionally equivalent

6) Time-lapse export
- Draw a short session, export time-lapse, confirm JSON includes strokes with timestamps

7) Dev trace
- Enable dev trace and reproduce bug, then download dev-trace.json and attach to PR

Record results and any console errors.
