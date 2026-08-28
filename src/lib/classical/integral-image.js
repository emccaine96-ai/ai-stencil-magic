/**
 * Integral image (summed-area table) construction.
 * Enables O(1) window-sum queries for adaptive threshold and other operations.
 *
 * Part of Master Spec Phase 1 — performance optimization, no visual behavior change.
 */

/**
 * Build an integral image from an ImageData's luminance channel.
 * @param {ImageData} imageData
 * @returns {Float64Array} - integral[row * width + col], cumulative sum from (0,0) to (row,col)
 */
export function integralImage(imageData) {
  const { width, height, data } = imageData;
  const integral = new Float64Array(width * height);

  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      const lum = data[(y * width + x) * 4]; // already grayscale (R=G=B)
      rowSum += lum;
      if (y === 0) {
        integral[y * width + x] = rowSum;
      } else {
        integral[y * width + x] = integral[(y - 1) * width + x] + rowSum;
      }
    }
  }
  return integral;
}

/**
 * Query the sum of a rectangular region in O(1).
 * @param {Float64Array} integral - from integralImage()
 * @param {number} width
 * @param {number} x0, y0, x1, y1 - inclusive bounds
 * @returns {number} sum of pixel values in the rectangle
 */
export function integralSum(integral, width, x0, y0, x1, y1) {
  return integral[y1 * width + x1]
    - (y0 > 0 ? integral[(y0 - 1) * width + x1] : 0)
    - (x0 > 0 ? integral[y1 * width + (x0 - 1)] : 0)
    + (y0 > 0 && x0 > 0 ? integral[(y0 - 1) * width + (x0 - 1)] : 0);
}
