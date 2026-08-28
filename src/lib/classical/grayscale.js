/**
 * Grayscale conversion — extracted from ClassicalProEngine for modularity.
 * Uses luminance weighting: 0.299R + 0.587G + 0.114B
 */
export function toGrayscale(imageData) {
  const d = imageData.data;
  for (let i = 0; i < d.length; i += 4) {
    const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    d[i] = d[i + 1] = d[i + 2] = g;
  }
  return imageData;
}
