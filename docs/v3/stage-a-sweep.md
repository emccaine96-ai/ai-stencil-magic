# V3.2 Stage A sweep (in progress)

Harness: `scripts/v3/sweep.ts`, 9 shipped pairs, V3 input capped at 1024 px, repo `scorePair` unmodified.
F1, recall and precision are the **2 px tolerance** columns (`f1_2`, `recall2`, `precision2`), which is what
`docs/HectographV32-evaluation.md` reports. Reproduced on original main 93ae504: tattoo-clean F1 0.753.
Node, one machine; ms is relative only. These nine pairs are in-sample.

Pass bar: F1 no more than 0.02 below the measured baseline (so >= 0.733 for tattoo-clean);
ink coverage 0.22 to 0.30; mean stroke width <= 3.5 px; specks <= 12 per 100k.

## tattoo-clean
| Config | F1 | Recall | Precision | Ink coverage | Stroke px | Highlight noise | Specks/100k | Off-edge ink | ms |
|---|---|---|---|---|---|---|---|---|---|
| baseline (no budget, switches on) | 0.753 | 0.826 | 0.741 | 0.369 | 5.552 | 0.322 | 14.344 | 0.143 | 838 |
| A1 budget 0.30, current defaults | 0.755 | 0.816 | 0.747 | 0.348 | 5.476 | 0.307 | 8.316 | 0.132 | 679 |
| A2 budget 0.30, broad DoG off | 0.755 | 0.816 | 0.747 | 0.348 | 5.476 | 0.307 | 8.323 | 0.131 | 663 |
| A3 budget 0.30, sigma 3.2 off | 0.755 | 0.811 | 0.750 | 0.337 | 4.978 | 0.298 | 8.700 | 0.128 | 677 |
| A4 budget 0.30, both off | 0.754 | 0.808 | 0.752 | 0.330 | 4.663 | 0.296 | 9.030 | 0.128 | 619 |

## hectograph-rich
| Config | F1 | Recall | Precision | Ink coverage | Stroke px | Highlight noise | Specks/100k | Off-edge ink | ms |
|---|---|---|---|---|---|---|---|---|---|
| baseline (no budget, switches on) | 0.751 | 0.833 | 0.736 | 0.383 | 5.959 | 0.334 | 11.966 | 0.155 | 693 |
| A1 budget 0.30, current defaults | 0.754 | 0.824 | 0.742 | 0.362 | 5.552 | 0.327 | 7.931 | 0.144 | 683 |
| A2 budget 0.30, broad DoG off | 0.754 | 0.824 | 0.742 | 0.361 | 5.644 | 0.327 | 7.979 | 0.144 | 652 |
| A3 budget 0.30, sigma 3.2 off | 0.753 | 0.819 | 0.746 | 0.350 | 5.254 | 0.320 | 8.118 | 0.140 | 656 |
| A4 budget 0.30, both off | 0.753 | 0.816 | 0.748 | 0.343 | 4.940 | 0.318 | 8.405 | 0.139 | 625 |

## Why ink stays above 0.30 (scripts/v3/ink-gap.ts, tattoo-clean, budget 0.30)
The floor is capped at 0.5, so on dense images the budget saturates:
hibiscus 0.45, elder 0.40, poseidon 0.50, aztec 0.56 non-white; the other five are at or under 0.30.
