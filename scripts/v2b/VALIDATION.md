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
