/**
 * Regression tests for the Classical Pro Engine — Master Spec Section 76.
 *
 * Tests:
 *   - Blank image (all white)
 *   - Solid black
 *   - Solid white
 *   - Horizontal line
 *   - Vertical line
 *   - Diagonal line
 *   - Circle
 *   - Square
 *   - Gradient
 *   - Noisy image
 *
 * Each test verifies: no crashes, no NaNs, correct dimensions, deterministic output.
 *
 * These tests require a browser environment (canvas/ImageData).
 * Run from the browser console or a test runner with canvas polyfill.
 */

import { DeterministicRNG, createImageRNG } from '../deterministic-rng.js';
import { integralImage, integralSum } from '../integral-image.js';
import { adaptiveThreshold } from '../threshold.js';

// --- Test helpers ---

function makeImage(w, h, fillFn) {
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = fillFn(x, y);
      const i = (y * w + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  return img;
}

function assertNoNaN(imageData) {
  for (let i = 0; i < imageData.data.length; i++) {
    if (Number.isNaN(imageData.data[i])) {
      throw new Error(`NaN at index ${i}`);
    }
  }
}

function assertDimensions(imageData, w, h) {
  if (imageData.width !== w || imageData.height !== h) {
    throw new Error(`Expected ${w}x${h}, got ${imageData.width}x${imageData.height}`);
  }
}

function assertDeterministic(fn, ...args) {
  const r1 = fn(...args);
  const r2 = fn(...args);
  if (r1.data.length !== r2.data.length) {
    throw new Error('Non-deterministic: different data lengths');
  }
  for (let i = 0; i < r1.data.length; i++) {
    if (r1.data[i] !== r2.data[i]) {
      throw new Error(`Non-deterministic: pixel mismatch at ${i}: ${r1.data[i]} vs ${r2.data[i]}`);
    }
  }
}

// --- Test cases ---

const testCases = {
  'blank image (all white)': () => {
    const img = makeImage(64, 64, () => 255);
    const result = adaptiveThreshold(img, 15);
    assertDimensions(result, 64, 64);
    assertNoNaN(result);
    // All-white input should produce all-white output
    for (let i = 0; i < result.data.length; i += 4) {
      if (result.data[i] !== 255) throw new Error('Expected all-white output');
    }
    return true;
  },

  'solid black': () => {
    const img = makeImage(64, 64, () => 0);
    const result = adaptiveThreshold(img, 15);
    assertDimensions(result, 64, 64);
    assertNoNaN(result);
    // All-black input: mean is 0, so 0 < 0-5 is false → all white
    // This is correct behavior (no contrast = no threshold)
    return true;
  },

  'solid white': () => {
    const img = makeImage(64, 64, () => 255);
    const result = adaptiveThreshold(img, 15);
    assertDimensions(result, 64, 64);
    assertNoNaN(result);
    return true;
  },

  'horizontal line': () => {
    const img = makeImage(64, 64, (x, y) => (y === 32 ? 0 : 255));
    const result = adaptiveThreshold(img, 15);
    assertDimensions(result, 64, 64);
    assertNoNaN(result);
    return true;
  },

  'vertical line': () => {
    const img = makeImage(64, 64, (x, y) => (x === 32 ? 0 : 255));
    const result = adaptiveThreshold(img, 15);
    assertDimensions(result, 64, 64);
    assertNoNaN(result);
    return true;
  },

  'diagonal line': () => {
    const img = makeImage(64, 64, (x, y) => (x === y ? 0 : 255));
    const result = adaptiveThreshold(img, 15);
    assertDimensions(result, 64, 64);
    assertNoNaN(result);
    return true;
  },

  'circle': () => {
    const cx = 32, cy = 32, r = 16;
    const img = makeImage(64, 64, (x, y) => {
      const dx = x - cx, dy = y - cy;
      return Math.sqrt(dx * dx + dy * dy) <= r ? 0 : 255;
    });
    const result = adaptiveThreshold(img, 15);
    assertDimensions(result, 64, 64);
    assertNoNaN(result);
    return true;
  },

  'square': () => {
    const img = makeImage(64, 64, (x, y) => {
      return (x >= 20 && x <= 44 && y >= 20 && y <= 44) ? 0 : 255;
    });
    const result = adaptiveThreshold(img, 15);
    assertDimensions(result, 64, 64);
    assertNoNaN(result);
    return true;
  },

  'gradient': () => {
    const img = makeImage(64, 64, (x, y) => Math.round((x / 63) * 255));
    const result = adaptiveThreshold(img, 15);
    assertDimensions(result, 64, 64);
    assertNoNaN(result);
    return true;
  },

  'noisy image': () => {
    const rng = new DeterministicRNG(42);
    const img = makeImage(64, 64, () => Math.floor(rng.next() * 256));
    const result = adaptiveThreshold(img, 15);
    assertDimensions(result, 64, 64);
    assertNoNaN(result);
    return true;
  },
};

// --- Deterministic RNG tests ---

const rngTests = {
  'RNG determinism (same seed)': () => {
    const r1 = new DeterministicRNG(12345);
    const r2 = new DeterministicRNG(12345);
    for (let i = 0; i < 100; i++) {
      if (r1.next() !== r2.next()) throw new Error('RNG not deterministic with same seed');
    }
    return true;
  },

  'RNG different seeds produce different sequences': () => {
    const r1 = new DeterministicRNG(1);
    const r2 = new DeterministicRNG(2);
    let diffs = 0;
    for (let i = 0; i < 100; i++) {
      if (r1.next() !== r2.next()) diffs++;
    }
    if (diffs === 0) throw new Error('Different seeds produced identical sequences');
    return true;
  },

  'RNG range [0, 1)': () => {
    const rng = new DeterministicRNG(42);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      if (v < 0 || v >= 1) throw new Error(`RNG out of range: ${v}`);
    }
    return true;
  },

  'createImageRNG determinism': () => {
    const r1 = createImageRNG(100, 100);
    const r2 = createImageRNG(100, 100);
    for (let i = 0; i < 100; i++) {
      if (r1.next() !== r2.next()) throw new Error('ImageRNG not deterministic');
    }
    return true;
  },

  'createImageRNG different dimensions = different sequences': () => {
    const r1 = createImageRNG(100, 100);
    const r2 = createImageRNG(200, 100);
    let diffs = 0;
    for (let i = 0; i < 100; i++) {
      if (r1.next() !== r2.next()) diffs++;
    }
    if (diffs === 0) throw new Error('Different dimensions produced identical sequences');
    return true;
  },
};

// --- Integral image tests ---

const integralTests = {
  'integral image correct sum': () => {
    const img = makeImage(8, 8, (x, y) => x + y);
    const integral = integralImage(img);
    // Sum of entire image
    const total = integralSum(integral, 8, 0, 0, 7, 7);
    let expected = 0;
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) expected += x + y;
    if (Math.abs(total - expected) > 0.5) throw new Error(`Integral sum: ${total} != ${expected}`);
    return true;
  },

  'integral image sub-region': () => {
    const img = makeImage(16, 16, (x, y) => 1);
    const integral = integralImage(img);
    // Sum of region (2,2)-(5,5) should be 4*4 = 16
    const sum = integralSum(integral, 16, 2, 2, 5, 5);
    if (sum !== 16) throw new Error(`Sub-region sum: ${sum} != 16`);
    return true;
  },

  'adaptiveThreshold deterministic': () => {
    const img = makeImage(32, 32, (x, y) => Math.round((x / 31) * 255));
    assertDeterministic(adaptiveThreshold, img, 11);
    return true;
  },
};

// --- Runner ---

export function runAllTests() {
  const allSuites = {
    'Engine regression': testCases,
    'Deterministic RNG': rngTests,
    'Integral image': integralTests,
  };

  let passed = 0, failed = 0;
  const failures = [];

  for (const [suiteName, suite] of Object.entries(allSuites)) {
    console.log(`\n=== ${suiteName} ===`);
    for (const [testName, testFn] of Object.entries(suite)) {
      try {
        testFn();
        console.log(`  ✅ ${testName}`);
        passed++;
      } catch (e) {
        console.log(`  ❌ ${testName}: ${e.message}`);
        failed++;
        failures.push(`${suiteName} > ${testName}: ${e.message}`);
      }
    }
  }

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===`);
  if (failures.length > 0) {
    console.log('Failures:', failures);
  }
  return { passed, failed, failures };
}

if (typeof window !== 'undefined') {
  window.runClassicalTests = runAllTests;
}
