# V2 candidate validation log (branch v2/candidate-validation, base origin/main bf9b561)
Candidate placed in src/lib/classical-v2b/ (separate module, NOT wired into the app, live engine untouched).

## Executed pass
- tsc --noEmit whole project incl. 14 candidate files: 0 errors
- vite build: exit 0; module Web Worker emitted as separate chunk (worker-*.js, 15 kB)
- starter selftest passes AND fails under mutation of the EDT (test is not vacuous)
- numeric suite (scripts/v2b/numeric-suite.ts): 52/52 (gaussian mass/sigma/nonmutation, bilinear centres,
  percentile ties/NaN, alpha policy, bilateral edge-preservation, CLAHE odd sizes, XDoG, cleanup 4-connectivity)
- export suite (scripts/v2b/export-suite.ts): 24/24 (deterministic, binary at 0.5x-3x, exclusion leaks 0 ink and
  leaves other px untouched, invalid params rejected, monotonic width/run/threshold)
- real Chrome (puppeteer): prepare/render/export/PNG sequence OK; concurrent request rejected; stale export rejected;
  dispose mid-work rejects; use-after-dispose rejects; 0 console/page errors
- downloaded PNG decoded: 1050x1400, values only {0,255}, alpha 255, grey==grey==grey, 16.3% ink
- browser vs node export same input: ink 16.33% vs 16.37% (1.27% px differ: canvas vs sharp resampling)

## Issues found and fixed
1. cleanup.ts threshold tie: Float32 0.4 = 0.40000000596 > double 0.4, so "exactly threshold" counted as ink.
   Fix: threshold = Math.fround(threshold).
2. orientation.ts trust (coherence) = 3 full-res Gaussians (sigma 19), 3.3 s of 8.8 s prepare at 1600 px, duplicating
   work. Fix: coherenceFromGradients(reduction=2) reduces the TENSOR not the photo. reduction=1 bit-identical to
   original (0 px diff, 5 photos). reduction=2: 0.01-0.06% export px differ, ink IoU .995-.999.
   prepare 1600px 8.8s->5.8s; 2400px 25.9s->16.3s.

## Open / measured but NOT fixed
- prepare still 16 s at 2400 px (structureTensorOrientation 3.5 s @1600 + bilateral 0.9 s + xdog 1.6 s). Needs policy
  (cap analysis edge) or helper work.
- ink coverage drifts with analysis size (portrait 16.9% @600 -> 12.0% @1600). Same photo, different stencil weight.
  Blurred layout correlation is high (0.96 @800, 0.98 @1000, 0.995 @1280) so layout is stable; weight is not.
- tone match to photo lower than engine-v2's current V2 (0.90 vs 0.98 portrait): lighter, different look. Not judged by eye.
- hatching only; contours raster-based; not wired into create.tsx; no real-image visual review yet.

## Round 2 (Oct 28): drift fix + input policy
Root cause of ink drift (measured per layer): the CONTOUR layer. XDoG used a fixed 1.2 px sigma, a fixed 25/3 px
local-contrast window and a fixed 20 px speck area, so lines got relatively thinner as analysis size grew
(portrait combined ink 17.0% @512 -> 11.4% @1536). Hatch layer was tiny and already scale-consistent.
Fix: scale all three by max(w,h)/1024 (same convention hatch.ts uses). After: 13.7-14.0% (portrait), 10.6-11.1% (floral)
across 512..1536. At 1024 output is unchanged (scale = 1).
Layout stability vs a 1600 px analysis, post-fix: 600px 0.991-0.995, 800 0.995-0.997, 1000 0.996-0.998, 1280 0.998-0.999.
Policy (limits.ts): recommended analysis edge 1280 (v2AnalysisSize), hard limit 2400 px / 5.8 MP / min 8 px, export <= 36 MP.
Executed pass: tsc 0 errors; vite build ok; numeric 52/52; export 24/24; policy 27/27; starter selftest; real Chrome on
2 photos (concurrent/stale/dispose/use-after-dispose, 0 console errors); decoded PNGs strictly {0,255}, alpha 255.
Still open: prepare ~2 s @1280 (fine) but ~16 s @2400 (now unreachable via policy); no visual/artist review;
tone match 0.90 vs engine-v2's V2 0.98 (lighter, not judged by eye); not wired into create.tsx; C1/C2 absent.
