# V3.2 Stage B sweep

Harness `scripts/v3/*`, nine shipped pairs (in-sample), V3 input capped at 1024 px, repo `scorePair` unmodified.
F1, recall, precision are the **2 px tolerance** columns (what `docs/HectographV32-evaluation.md` reports; baseline F1 0.753
reproduced on original main 93ae504). Node, one machine, ms is relative only.
All rows: `inkBudget 0.30`, broad DoG off, sigma 3.2 off, unless stated.

**Pass bar:** ink coverage 0.22 to 0.30, mean stroke <= 3.5 px, F1 >= 0.733 (baseline 0.753 minus 0.02), specks <= 12 per 100k.

## B1. Thinning x floor cap (the requested grid)
| Preset | Config | F1 | Recall | Precision | Ink | Stroke px | Hi-noise | Specks/100k | Off-edge | ms | Misses |
|---|---|---|---|---|---|---|---|---|---|---|---|
| tattoo-clean | thin OFF, cap 0.5 | 0.754 | 0.808 | 0.752 | 0.330 | 4.663 | 0.296 | 9.030 | 0.128 | 684 | ink, stroke |
| tattoo-clean | thin OFF, cap 0.8 | 0.755 | 0.798 | 0.757 | 0.313 | 4.571 | 0.288 | 5.341 | 0.122 | 640 | ink, stroke |
| tattoo-clean | thin ON, cap 0.5 | 0.751 | 0.816 | 0.742 | 0.364 | 5.568 | 0.315 | 3.672 | 0.142 | 667 | ink, stroke |
| tattoo-clean | thin ON, cap 0.8 | 0.752 | 0.810 | 0.745 | 0.350 | 5.384 | 0.307 | 0.828 | 0.138 | 669 | ink, stroke |
| hectograph-rich | thin OFF, cap 0.5 | 0.753 | 0.816 | 0.748 | 0.343 | 4.940 | 0.318 | 8.405 | 0.139 | 625 | ink, stroke |
| hectograph-rich | thin OFF, cap 0.8 | 0.754 | 0.809 | 0.751 | 0.325 | 4.663 | 0.310 | 5.174 | 0.134 | 632 | ink, stroke |
| hectograph-rich | thin ON, cap 0.5 | 0.749 | 0.823 | 0.738 | 0.373 | 5.384 | 0.331 | 2.814 | 0.155 | 635 | ink, stroke |
| hectograph-rich | thin ON, cap 0.8 | 0.750 | 0.818 | 0.740 | 0.360 | 5.200 | 0.328 | 0.873 | 0.152 | 635 | ink, stroke |

**Result: no row meets the bar. Thinning (NMS across the edge-flow normal, then widen to 3 px) makes stroke width and ink WORSE on real photos**
(stroke 4.66 -> 5.57), although it works on synthetic lines (scripts/v3/verify-thin.mjs, 26 checks). Cause, measured with scripts/v3/layer-probe.ts
and source-probe.ts: the anchor layer is not a set of thin lines. With both switches off it still covers 28% to 61% of the page, and 18% to 33% of the
page is the sigma 1.9 Hessian alone at strength >= 0.5, plus 11 to 15 points from step edges. A filled region has no centreline to keep, and widening
the surviving pixels to 3 px adds ink. The cap 0.8 improves ink and specks a little; it does not fix stroke width.

## B2. Variants beyond the request (each its own row), tattoo-clean, cap 0.8
| Config | F1 | Recall | Precision | Ink | Stroke px | Hi-noise | Specks/100k | Off-edge | ms | Misses |
|---|---|---|---|---|---|---|---|---|---|---|
| anchor gate x1 | 0.755 | 0.798 | 0.757 | 0.313 | 4.571 | 0.288 | 5.341 | 0.122 | 767 | ink, stroke |
| anchor gate x1.5 | 0.751 | 0.763 | 0.770 | 0.279 | 4.571 | 0.241 | 9.824 | 0.104 | 626 | stroke |
| anchor gate x2 | 0.742 | 0.732 | 0.778 | 0.253 | 4.273 | 0.209 | 18.723 | 0.102 | 620 | stroke, specks |
| anchor gate x3 | 0.712 | 0.671 | 0.783 | 0.210 | 3.905 | 0.181 | 39.239 | 0.116 | 623 | ink, stroke, F1, specks |
| ridge anisotropy 0.8, gate x1.5 | 0.750 | 0.760 | 0.770 | 0.274 | 4.311 | 0.238 | 11.579 | 0.104 | 649 | stroke |
| ridge anisotropy 1.5, gate x1.5 | 0.748 | 0.755 | 0.771 | 0.267 | 3.905 | 0.236 | 14.347 | 0.105 | 621 | stroke, specks |
| ridge anisotropy 3, gate x1 | 0.752 | 0.784 | 0.760 | 0.283 | 3.552 | 0.271 | 12.036 | 0.121 | 691 | stroke, specks |
| ridge anisotropy 4, gate x1 | 0.752 | 0.782 | 0.761 | 0.277 | 3.422 | 0.265 | 13.936 | 0.121 | 621 | specks |
| ridge anisotropy 6, gate x1 | 0.751 | 0.779 | 0.762 | 0.269 | 3.108 | 0.262 | 16.939 | 0.121 | 633 | specks |
| ridge anisotropy 3 to 6, thin ON | 0.755 to 0.757 | 0.80 to 0.82 | 0.745 to 0.754 | 0.347 to 0.373 | 5.66 to 5.95 | 0.27 to 0.30 | 1.0 to 2.1 | 0.11 to 0.13 | 632 to 795 | ink, stroke |

Stroke width is set by the anchor layer (removing anchors: 4.57 -> 3.28 px; removing detail veins, halo or local contrast: under 0.15 px change,
scripts/v3/width-probe.ts). The lever that thins strokes without costing F1 is a stricter line-versus-blob test (`ridgeAnisotropy`), but thinner strokes
fragment, so specks rise above 12. The scorer counts any component under 12 strong-ink pixels as a speck; the engine's own `removeSpeckle` keeps small
components that are 12 px long and judges ink at a much fainter level (mean RGB < 235), so it does not remove them.

## B3. Strong-speck removal (new default-off option `strongSpeckPixels`)
| Preset | Config | F1 | Recall | Precision | Ink | Stroke px | Hi-noise | Specks/100k | Off-edge | ms | Meets bar (mean) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| tattoo-clean | aniso 4, speck 12 | 0.750 | 0.778 | 0.761 | 0.276 | 3.460 | 0.263 | 6.603 | 0.120 | 676 | yes |
| tattoo-clean | aniso 6, speck 12 | 0.749 | 0.775 | 0.762 | 0.268 | 3.238 | 0.260 | 8.391 | 0.121 | 631 | yes |
| hectograph-rich | aniso 4, speck 12 | 0.750 | 0.787 | 0.757 | 0.283 | 3.330 | 0.287 | 7.900 | 0.130 | 639 | yes |
| hectograph-rich | aniso 6, speck 12 | 0.749 | 0.785 | 0.757 | 0.276 | 3.016 | 0.281 | 8.672 | 0.130 | 634 | yes |

(All four: inkBudget 0.30, cap 0.8, broad DoG off, sigma 3.2 off, thin OFF.)

### Per photo, tattoo-clean, aniso 4, speck 12: the mean hides misses
| Photo | base F1 | cand F1 | dF1 | base ink | cand ink | base stroke | cand stroke | base specks | cand specks |
|---|---|---|---|---|---|---|---|---|---|
| hibiscus | 0.618 | 0.641 | +0.023 | 0.504 | 0.292 | 3.00 | 1.00 | 45.1 | 19.2 |
| elder | 0.606 | 0.645 | +0.039 | 0.444 | 0.308 | 4.66 | 1.83 | 35.2 | 5.3 |
| baby | 0.399 | 0.361 | -0.038 | 0.258 | 0.203 | 9.00 | 5.00 | 1.7 | 0.9 |
| poseidon | 0.748 | 0.751 | +0.004 | 0.553 | 0.372 | 3.83 | 1.00 | 29.0 | 18.4 |
| aztec | 0.900 | 0.872 | -0.027 | 0.612 | 0.420 | 7.00 | 3.00 | 5.8 | 15.5 |
| portrait | 0.964 | 0.969 | +0.004 | 0.297 | 0.275 | 5.00 | 3.83 | 4.5 | 0.0 |
| detail | 0.873 | 0.861 | -0.013 | 0.255 | 0.232 | 3.83 | 3.83 | 5.5 | 0.0 |
| floral-back | 0.824 | 0.810 | -0.014 | 0.238 | 0.225 | 6.66 | 5.00 | 1.9 | 0.0 |
| shoulder | 0.844 | 0.842 | -0.002 | 0.163 | 0.155 | 7.00 | 6.66 | 0.4 | 0.0 |

Individually, **no photo meets the whole bar**. Against the absolute per-photo bar: ink misses on elder (0.308), baby (0.203, too low), poseidon (0.372),
aztec (0.420) and shoulder (0.155, too low); stroke misses on baby, portrait, detail, floral-back, shoulder; specks miss on hibiscus, poseidon, aztec.
The mean meets the ink band only because over- and under-inked photos cancel. The worst single-photo F1 change against each photo's own baseline is -0.038 (baby),
and four photos improve. Stroke 1.00 on hibiscus and poseidon is probably a scorer artefact on a fragmented mask, not a real 1 px stroke.
