/**
 * Output color mapping — hectograph purple and transparent background.
 * Extracted from ClassicalProEngine for modularity.
 */

export function mapToHectographPurple(imageData, purple = { r: 168, g: 85, b: 247 }) {
  const d = imageData.data;
  const { r, g, b } = purple;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] < 128) {
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    } else {
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = 0;
    }
  }
  return imageData;
}

export function makeTransparentBackground(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i] >= 128) {
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = 0;
    } else {
      d[i + 3] = 255;
    }
  }
  return imageData;
}
