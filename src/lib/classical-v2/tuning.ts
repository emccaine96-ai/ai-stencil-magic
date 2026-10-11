/**
 * classical-v2 / tuning
 * The 6 optional threshold knobs for the FREE client-side engine only.
 * Every knob is a neutral offset: 0 (or 1 for multipliers) reproduces the engine's
 * calibrated default output exactly. Deliberately NOT brightness / contrast /
 * opacity / size / rotate / curves / ink colour: those already live in the
 * Retouch Studio.
 */
import type { V2Options } from "./pipeline";
import { HATCH_LADDERS } from "./hatch";

export interface V2Tuning {
  lineSensitivity: number; // -1..1  more (+) or fewer (-) contour lines   -> xdog.epsilon
  lineCrispness: number;   // -1..1  soft (-) to crisp (+) line edges      -> xdog.phi
  shadingStart: number;    // -1..1  shade less (-) or more (+) of the mids -> hatch levels shift
  hatchSpacing: number;    // -1..1  open (-) to dense (+) hatching          -> spacing scale
  strokeWeight: number;    // -1..1  thinner (-) to bolder (+) hatch strokes -> hatch width
  speckCleanup: number;    //  0..1  how aggressively tiny fragments are dropped
}

export const DEFAULT_TUNING: V2Tuning = {
  lineSensitivity: 0,
  lineCrispness: 0,
  shadingStart: 0,
  hatchSpacing: 0,
  strokeWeight: 0,
  speckCleanup: 0.5,
};

export interface KnobDef {
  key: keyof V2Tuning;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  lowLabel: string;
  highLabel: string;
}

export const KNOBS: KnobDef[] = [
  { key: "lineSensitivity", label: "Line sensitivity", hint: "How much faint detail becomes a line", min: -1, max: 1, step: 0.05, lowLabel: "Fewer", highLabel: "More" },
  { key: "lineCrispness", label: "Line crispness", hint: "Soft pencil edge to sharp ink edge", min: -1, max: 1, step: 0.05, lowLabel: "Soft", highLabel: "Crisp" },
  { key: "shadingStart", label: "Shading amount", hint: "How much of the mid-tones get shaded", min: -1, max: 1, step: 0.05, lowLabel: "Less", highLabel: "More" },
  { key: "hatchSpacing", label: "Hatch density", hint: "Gap between shading lines", min: -1, max: 1, step: 0.05, lowLabel: "Open", highLabel: "Dense" },
  { key: "strokeWeight", label: "Stroke weight", hint: "Thickness of the shading strokes", min: -1, max: 1, step: 0.05, lowLabel: "Thin", highLabel: "Bold" },
  { key: "speckCleanup", label: "Speck cleanup", hint: "Remove tiny stray marks", min: 0, max: 1, step: 0.05, lowLabel: "Keep", highLabel: "Clean" },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function isDefaultTuning(t: V2Tuning): boolean {
  return (Object.keys(DEFAULT_TUNING) as (keyof V2Tuning)[]).every((k) => Math.abs(t[k] - DEFAULT_TUNING[k]) < 1e-6);
}

/**
 * Translate knob positions into V2Options overrides. At DEFAULT_TUNING this returns
 * an object that changes nothing (empty xdog/hatch, default cleanup sizes).
 * `baseLadder` is the ladder the pipeline would pick (so shifts are relative to it).
 */
export function tuningToOptions(
  t: V2Tuning,
  baseLadder: keyof typeof HATCH_LADDERS,
  darkKeyed: boolean,
): Pick<V2Options, "xdog" | "hatch" | "minLinePx" | "minHatchPx"> {
  const ladder = HATCH_LADDERS[baseLadder];
  const xdog: NonNullable<V2Options["xdog"]> = {};
  const hatch: NonNullable<V2Options["hatch"]> = {};

  // epsilon: base is 0 (or 0.02 for dark-keyed photos). In xdogInk, higher epsilon pushes the
  // tanh ramp toward ink, so +sensitivity raises it (verified against measured ink coverage).
  const baseEps = darkKeyed ? 0.02 : 0;
  if (t.lineSensitivity !== 0) xdog.epsilon = baseEps + t.lineSensitivity * 0.05;
  // phi: base 10. Range 4 (soft) .. 22 (crisp), geometric so the slider feels even.
  if (t.lineCrispness !== 0) xdog.phi = 10 * Math.pow(2.2, t.lineCrispness);

  // Shading start: shift every tone threshold together, keeping the ladder's shape.
  if (t.shadingStart !== 0) hatch.levels = ladder.levels.map((l) => clamp(l + t.shadingStart * 0.12, 0.05, 0.9));
  // Spacing: scale both ends; + = denser = smaller gaps.
  if (t.hatchSpacing !== 0) {
    const f = Math.pow(1.6, -t.hatchSpacing);
    hatch.spacing = [Math.max(3, ladder.spacing[0] * f), Math.max(5, ladder.spacing[1] * f)];
  }
  // Stroke weight: base 1.7px, range ~1.0 .. 2.8.
  if (t.strokeWeight !== 0) hatch.width = clamp(1.7 + t.strokeWeight * 1.1, 0.8, 3);

  // Speck cleanup: 0.5 is the calibrated default (20 / 30 px). 0 -> keep nearly all, 1 -> aggressive.
  const k = Math.pow(3, (t.speckCleanup - 0.5) * 2); // 0.5 -> 1, 0 -> 1/3, 1 -> 3
  const minLinePx = Math.max(2, Math.round(20 * k));
  const minHatchPx = Math.max(3, Math.round(30 * k));
  return { xdog, hatch, minLinePx, minHatchPx };
}
