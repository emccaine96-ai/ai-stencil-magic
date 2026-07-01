/**
 * Canonical blend-mode list with human labels and category groupings for the
 * layers panel and brush blend picker.
 */

export const BLEND_MODES = [
  { value: "source-over", label: "Normal", category: "Basic" },
  { value: "multiply", label: "Multiply", category: "Darken" },
  { value: "darken", label: "Darken", category: "Darken" },
  { value: "color-burn", label: "Color Burn", category: "Darken" },
  { value: "screen", label: "Screen", category: "Lighten" },
  { value: "lighten", label: "Lighten", category: "Lighten" },
  { value: "color-dodge", label: "Color Dodge", category: "Lighten" },
  { value: "overlay", label: "Overlay", category: "Contrast" },
  { value: "hard-light", label: "Hard Light", category: "Contrast" },
  { value: "soft-light", label: "Soft Light", category: "Contrast" },
  { value: "difference", label: "Difference", category: "Inversion" },
  { value: "exclusion", label: "Exclusion", category: "Inversion" },
  { value: "hue", label: "Hue", category: "Component" },
  { value: "saturation", label: "Saturation", category: "Component" },
  { value: "color", label: "Color", category: "Component" },
  { value: "luminosity", label: "Luminosity", category: "Component" },
] as const;

export type BlendMode = (typeof BLEND_MODES)[number]["value"];

export function groupBlendModes(): Record<string, typeof BLEND_MODES[number][]> {
  const groups: Record<string, typeof BLEND_MODES[number][]> = {};
  for (const mode of BLEND_MODES) {
    (groups[mode.category] ||= []).push(mode);
  }
  return groups;
}