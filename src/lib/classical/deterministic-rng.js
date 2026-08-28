/**
 * Seeded deterministic RNG — Linear Congruential Generator (LCG).
 * Same seed + same sequence of calls = same output, every time.
 *
 * Replaces the ad-hoc inline seeded generator in stochasticStipple()
 * so all stochastic operations go through one shared, testable implementation.
 *
 * Part of Master Spec Phase 1.
 */

export class DeterministicRNG {
  constructor(seed) {
    this.seed = (seed >>> 0) || 1;
    this.state = this.seed;
  }

  /** Returns a float in [0, 1) */
  next() {
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 4294967296;
  }

  /** Returns a float in [min, max) */
  range(min, max) {
    return min + this.next() * (max - min);
  }

  /** Returns an integer in [min, max] inclusive */
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }

  /** Reset to original seed */
  reset() {
    this.state = this.seed;
  }
}

/**
 * Create a seeded RNG from image dimensions (same as the original inline generator).
 * This ensures stippling stays deterministic: same input dimensions = same dot pattern.
 */
export function createImageRNG(width, height) {
  const seed = (width * 73856093) ^ (height * 19349663) ^ 0x9e3779b9;
  return new DeterministicRNG(seed);
}
