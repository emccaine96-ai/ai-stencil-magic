// Instagram-style one-tap filter presets, expressed as AdjustmentValues
// so they render through the shared adjustments engine.

import type { AdjustmentValues } from "./adjustments";

export interface FilterPreset {
  id: string;
  name: string;
  values: AdjustmentValues;
}

export const FILTER_PRESETS: FilterPreset[] = [
  { id: "original", name: "Original", values: {} },
  {
    id: "vivid",
    name: "Vivid",
    values: { contrast: 18, saturation: 25, vibrance: 20, exposure: 6 },
  },
  { id: "punch", name: "Punch", values: { contrast: 30, saturation: 15, brightness: -4 } },
  { id: "warm", name: "Warm", values: { temperature: 28, tint: -8, saturation: 10, exposure: 4 } },
  { id: "cool", name: "Cool", values: { temperature: -30, tint: 6, saturation: 8 } },
  {
    id: "matte",
    name: "Matte",
    values: { contrast: -12, gamma: 1.1, saturation: -8, brightness: 6 },
  },
  {
    id: "fade",
    name: "Fade",
    values: { contrast: -18, exposure: 8, saturation: -14, gamma: 1.15 },
  },
  { id: "mono", name: "Mono", values: { grayscale: true, contrast: 12 } },
  {
    id: "silver",
    name: "Silver",
    values: { grayscale: true, contrast: 22, brightness: -4, gamma: 1.05 },
  },
  {
    id: "noir",
    name: "Noir",
    values: { grayscale: true, contrast: 40, brightness: -12, gamma: 0.9 },
  },
  {
    id: "sepia",
    name: "Sepia",
    values: { grayscale: true, temperature: 55, tint: -20, saturation: 40, brightness: -4 },
  },
  {
    id: "clarendon",
    name: "Clarendon",
    values: { contrast: 20, saturation: 22, brightness: 6, temperature: -6 },
  },
  {
    id: "gingham",
    name: "Gingham",
    values: { brightness: 10, contrast: -8, temperature: 8, saturation: -10 },
  },
  {
    id: "moon",
    name: "Moon",
    values: { grayscale: true, contrast: 10, brightness: 4, gamma: 1.08 },
  },
  {
    id: "lark",
    name: "Lark",
    values: { exposure: 10, temperature: -12, saturation: 12, vibrance: 10 },
  },
  {
    id: "reyes",
    name: "Reyes",
    values: { exposure: 14, contrast: -14, saturation: -18, temperature: 10 },
  },
  {
    id: "juno",
    name: "Juno",
    values: { contrast: 12, saturation: 22, temperature: 14, vibrance: 8 },
  },
  {
    id: "slumber",
    name: "Slumber",
    values: { exposure: 8, contrast: -10, saturation: -22, temperature: 18 },
  },
  {
    id: "crema",
    name: "Crema",
    values: { contrast: -6, saturation: -6, temperature: 12, gamma: 1.05 },
  },
  { id: "invert", name: "Invert", values: { invert: true } },
  { id: "hueshift", name: "Hue Shift", values: { hue: 60, saturation: 20 } },
  { id: "dream", name: "Dream", values: { exposure: 10, contrast: -8, vibrance: 20, gamma: 1.1 } },
];
