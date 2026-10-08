import { toBinaryMask, edgeOverlapFScore } from '../../calibration/fscore.js';

export function runAllTests() {
  const testCases = {
    'purple transparent and white masks match': () => {
      const transparent = new ImageData(32, 32);
      const white = new ImageData(32, 32);
      white.data.fill(255);
      for (let y = 4; y < 28; y++) {
        const i = (y * 32 + y) * 4;
        for (const img of [transparent, white]) img.data.set([168, 85, 247, 255], i);
      }
      const a = toBinaryMask(transparent), b = toBinaryMask(white);
      if (a.mask.reduce((sum, v) => sum + v, 0) !== 24) throw new Error('Expected 24 ink pixels');
      if (a.mask.some((v, i) => v !== b.mask[i])) throw new Error('Background changed mask');
      if (edgeOverlapFScore(a, b).f1 !== 1) throw new Error('Identical strokes must score 1');
    },
    'blank white sheet has zero ink': () => {
      const img = new ImageData(32, 32);
      img.data.fill(255);
      if (toBinaryMask(img).mask.some(Boolean)) throw new Error('White sheet counted as ink');
    },
    'alpha composites over white and custom threshold works': () => {
      const img = new ImageData(3, 1);
      img.data.set([0, 0, 0, 0, 168, 85, 247, 128, 168, 85, 247, 255]);
      const mask = toBinaryMask(img).mask;
      if (mask[0] !== 0 || mask[1] !== 0 || mask[2] !== 1) throw new Error('Wrong alpha handling');
      if (toBinaryMask(img, 80).mask[1] !== 1) throw new Error('Custom ink threshold ignored');
    },
  };
  let passed = 0;
  const failures = [];
  for (const [name, test] of Object.entries(testCases)) {
    try { test(); passed++; } catch (error) { failures.push(`${name}: ${error.message}`); }
  }
  return { passed, failed: failures.length, failures };
}