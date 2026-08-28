/**
 * Calibration Runner — recalibrates `hatching` and `solid` style parameters
 * using the existing fscore + coordinate-descent harness.
 *
 * Usage: open the app in a browser, then run this from the console:
 *   import('/src/lib/calibration/run-calibration.js').then(m => m.runAllCalibration())
 *
 * Or import it from another module:
 *   import { runAllCalibration } from './run-calibration';
 */

import { ClassicalProEngine } from '../classical-pro-engine.js';
import { simpleCoordinateDescent } from './calibration-harness.js';
import { STYLE_TO_CLASSICAL } from '../style-engine-map';

// The two parameters to search, with ranges anchored to what's already working:
// dotwork uses 0.93/9, hybrid uses 0.98/15 — search pulls solid/hatching toward these.
const PARAM_RANGES = {
  edge_sensitivity: [0.88, 0.97, 8],   // 9 steps from 0.88 to 0.97
  shadow_block: [9, 21, 6],            // 7 steps from 9 to 21
};

/**
 * Build pairs array from the example assets already in the app.
 * Each pair needs: { source (original), gemini (AI-generated reference) }
 *
 * @param {Array<{id: string, sourceUrl: string, geminiUrl: string}>} pairs
 */
async function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

/**
 * Run calibration for a single style.
 * @param {string} styleName - 'hatching' or 'solid'
 * @param {Array} pairs - [{id, source, gemini}]
 * @returns {Promise<{styleName, beforeF1, afterF1, bestSettings}>}
 */
async function calibrateStyle(styleName, pairs) {
  const canvas = document.createElement('canvas');
  const engine = new ClassicalProEngine(canvas);
  const initialSettings = STYLE_TO_CLASSICAL[styleName];

  console.log(`\n=== Calibrating ${styleName} ===`);
  console.log('Initial settings:', { edge_sensitivity: initialSettings.edge_sensitivity, shadow_block: initialSettings.shadow_block });

  // Score the current settings first
  const { runBatchCalibration } = await import('./calibration-harness.js');
  const beforeResult = await runBatchCalibration(engine, pairs, initialSettings);
  console.log(`Before: mean F1 = ${beforeResult.meanF1.toFixed(4)}`);

  // Run coordinate descent search
  const { bestSettings, bestScore } = await simpleCoordinateDescent(
    engine,
    pairs,
    { ...initialSettings },
    PARAM_RANGES,
  );

  console.log(`After:  mean F1 = ${bestScore.toFixed(4)}`);
  console.log('Best settings:', {
    edge_sensitivity: bestSettings.edge_sensitivity,
    shadow_block: bestSettings.shadow_block,
  });

  return {
    styleName,
    beforeF1: beforeResult.meanF1,
    afterF1: bestScore,
    bestSettings: {
      edge_sensitivity: bestSettings.edge_sensitivity,
      shadow_block: bestSettings.shadow_block,
    },
  };
}

/**
 * Run calibration for both hatching and solid styles.
 * @param {Array<{id: string, sourceUrl: string, geminiUrl: string}>} pairs
 */
export async function runAllCalibration(pairs) {
  // Load all images
  const loadedPairs = [];
  for (const p of pairs) {
    try {
      const source = await loadImage(p.sourceUrl);
      const gemini = await loadImage(p.geminiUrl);
      loadedPairs.push({ id: p.id, source, gemini });
    } catch (e) {
      console.warn(`Failed to load pair ${p.id}:`, e);
    }
  }

  console.log(`Loaded ${loadedPairs.length} calibration pairs`);

  const hatchingResult = await calibrateStyle('hatching', loadedPairs);
  const solidResult = await calibrateStyle('solid', loadedPairs);

  console.log('\n=== SUMMARY ===');
  console.log('Hatching:', hatchingResult);
  console.log('Solid:', solidResult);

  return { hatching: hatchingResult, solid: solidResult };
}

export { calibrateStyle, runAllCalibration };
