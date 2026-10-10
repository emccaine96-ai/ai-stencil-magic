# engine-v2 prototype (Python / OpenCV)

Status: PROTOTYPE. Not wired into the app. Nothing under `src/` was changed.
The JS port into `src/lib/classical*` has not been done yet.

## What it does
Pencil-style stencil rendering instead of a hard 1-bit threshold:
1. `prep2` (engine3): bilateral + gentle CLAHE blended with the original so dark
   regions are not washed out (applied to dark-keyed images, median tone < 110).
2. `xdog_local` (engine6): real XDoG with epsilon / phi / p, soft tanh ramp.
3. `hatch2` (engine5): flow-following hatch screens drawn at 2x supersampling,
   stroke width grows with darkness. A light-tone layer (baby config) models soft
   mid-tone areas such as noses and cheeks.
4. `clean` (engine2): drops tiny connected fragments.

`final_v5.py` is the current best pipeline; `final_v4.CFG` holds per-subject tone ladders.

## Run
    pip install opencv-python-headless numpy
    STENCIL_PHOTOS=/path/to/photos python final_v5.py   # edit SRC filenames in common.py

## Measurements (python metrics.py out.png)
Reference stencils: ~2% of ink in specks, ~95% in long strokes.
Prototype: <0.5% specks, 88-94% long strokes, 15-40% coverage.
These are structure metrics only; they do not prove visual quality.

## Known limits
- Tuned on 4 photos only (tiger, hibiscus, elder, baby).
- Baby source photo is 408x373, so some missing detail is the input.
- Faces will not match AI-drawn portrait references; Hybrid mode covers that.
