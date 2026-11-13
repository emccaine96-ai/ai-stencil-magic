# Hectograph V3.2: head-to-head evaluation (candidate, opt-in)

Status: V3.2 ships as an opt-in fifth engine, default OFF. This file is the evidence for the promotion decision. It does not promote anything.

## What was run
- Scorer: the repo's own `scorePair` from `src/lib/calibration/engine-metrics.js` (unmodified), same normalisation for every engine.
- Reference: the Gemini "after" image of each shipped example pair (9 pairs: hibiscus, elder, baby, poseidon, aztec, portrait, detail, floral-back, shoulder).
- Candidates: V3.2 `tattoo-clean` and `hectograph-rich`; live Classical Pro `hatching` and `hybrid` at intensity 0.7 (the app default).
- V3.2 ran on a copy capped at 1024 px on the long edge. Node with the `canvas` package, one machine. Speed is relative only and is not a phone benchmark.

## Results (mean over 9 pairs)
| Engine | F1 | Recall | Precision | Ink coverage | Stroke px | Highlight noise | Specks/100k | Off-edge ink | ms |
|---|---|---|---|---|---|---|---|---|---|
| v32-clean | 0.753 | 0.826 | 0.740 | 0.369 | 5.590 | 0.321 | 14.415 | 0.143 | 2306 |
| v32-rich | 0.751 | 0.833 | 0.736 | 0.383 | 5.920 | 0.334 | 11.961 | 0.155 | 2276 |
| live-hatching | 0.722 | 0.773 | 0.743 | 0.234 | 2.571 | 0.376 | 16.349 | 0.187 | 3310 |
| live-hybrid | 0.741 | 0.785 | 0.753 | 0.340 | 4.794 | 0.291 | 19.398 | 0.154 | 2423 |
| Gemini reference | - | - | - | 0.263 | 2.387 | - | - | - | - |

## Reading
- Contour agreement: V3.2 F1 is slightly higher than the live engines (about 0.75 vs 0.72 to 0.74). F1 rewards ink, so this alone does not prove it is better.
- V3.2 is heavier than the reference: about 37% ink vs 26% for Gemini. Live hatching is closer (23%).
- V3.2 strokes are about 5.6 px vs 2.4 px for Gemini. Live hatching is 2.6 px.
- The largest ink overshoot is on the dense photos (hibiscus, elder, poseidon).

## Not done (gates still open)
- 20+ held-out photos with no Gemini pair were not scored here (there is no reference to score them against). Only the 9 shipped pairs were.
- Neural step ON/OFF comparison: the neural step is not in this build.
- Real low-end Android benchmark.
- Licenses and approval for onnxruntime-web, model and WASM hosting.
- Blind side-by-side judged by the owner.
