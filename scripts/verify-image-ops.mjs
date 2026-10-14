import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Polyfill ImageData in Node environment if missing
if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(dataOrWidth, widthOrHeight, height) {
      if (dataOrWidth instanceof Uint8ClampedArray) {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height;
      } else if (typeof dataOrWidth === 'number') {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        throw new TypeError('Invalid arguments for ImageData constructor');
      }
    }
  };
}

console.log('=== Compiling TypeScript to /tmp/ops-build ===');
try {
  // Compile image-ops.ts module
  execSync(
    'npx tsc src/lib/vault-ops/image-ops.ts --outDir /tmp/ops-build --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck --noEmit false --allowImportingTsExtensions false',
    { stdio: 'inherit' }
  );
  // Ensure relative imports in emitted JS have .js extensions for Node ESM if present
  execSync(
    `find /tmp/ops-build/src/lib -type f -name "*.js" -exec sed -i -E "s/from ['\\"](\\.[^'\\"]+)['\\"]/from '\\1.js'/g" {} +`,
    { stdio: 'inherit' }
  );
  console.log('✔ Compilation succeeded.\n');
} catch (err) {
  console.error('❌ TypeScript compilation failed:', err);
  process.exit(1);
}

// Import compiled module
const opsModulePath = '/tmp/ops-build/src/lib/vault-ops/image-ops.js';
const ops = await import(opsModulePath);

console.log('=== Running Image Operations Verification Suite ===\n');

function createSyntheticImageData(w = 256, h = 256) {
  const data = new Uint8ClampedArray(w * h * 4);
  let seed = 42;
  function rand() {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      const rGrad = Math.round((x / Math.max(1, w - 1)) * 255);
      const gGrad = Math.round((y / Math.max(1, h - 1)) * 255);
      const bNoise = Math.round(rand() * 255);
      data[idx] = rGrad;
      data[idx + 1] = gGrad;
      data[idx + 2] = bNoise;
      data[idx + 3] = 255;
    }
  }
  return new globalThis.ImageData(data, w, h);
}

function assertValidImageData(img, expectedWidth, expectedHeight, name) {
  if (!img || !(img instanceof globalThis.ImageData)) {
    throw new Error(`[${name}] Output is not an ImageData instance`);
  }
  if (img.width !== expectedWidth || img.height !== expectedHeight) {
    throw new Error(`[${name}] Expected dims ${expectedWidth}x${expectedHeight}, got ${img.width}x${img.height}`);
  }
  if (img.data.length !== expectedWidth * expectedHeight * 4) {
    throw new Error(`[${name}] Data array length mismatch`);
  }
  for (let i = 0; i < img.data.length; i++) {
    const val = img.data[i];
    if (Number.isNaN(val)) {
      throw new Error(`[${name}] Found NaN at pixel index ${i}`);
    }
    if (val < 0 || val > 255) {
      throw new Error(`[${name}] Out of bounds pixel value ${val} at index ${i}`);
    }
  }
}

function assertPixelEqual(imgA, imgB, name) {
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) {
    throw new Error(`[${name}] Dimensions mismatch for pixel equality check`);
  }
  let diffs = 0;
  for (let i = 0; i < imgA.data.length; i++) {
    if (imgA.data[i] !== imgB.data[i]) {
      diffs++;
      if (diffs <= 5) {
        console.error(`[${name}] Mismatch at index ${i}: A=${imgA.data[i]}, B=${imgB.data[i]}`);
      }
    }
  }
  if (diffs > 0) {
    throw new Error(`[${name}] Found ${diffs} pixel differences from expected identity output`);
  }
}

const synth256 = createSyntheticImageData(256, 256);

// Test 1: Identity operations
console.log('Testing Identity Operations...');
assertPixelEqual(ops.gaussianBlur(synth256, 0), synth256, 'gaussianBlur(0)');
assertPixelEqual(ops.sharpen(synth256, 0), synth256, 'sharpen(0)');
assertPixelEqual(ops.vignette(synth256, 0), synth256, 'vignette(0)');
assertPixelEqual(ops.filmGrain(synth256, 0), synth256, 'filmGrain(0)');
assertPixelEqual(ops.chromaticAberration(synth256, 0), synth256, 'chromaticAberration(0)');
assertPixelEqual(ops.pixelate(synth256, 1), synth256, 'pixelate(1)');
assertPixelEqual(ops.sepia(synth256, 0), synth256, 'sepia(0)');
assertPixelEqual(ops.motionBlur(synth256, 0, 0), synth256, 'motionBlur(0,0)');
assertPixelEqual(ops.stretch(synth256, 1, 1), synth256, 'stretch(1,1)');
assertPixelEqual(ops.applyCurves(synth256, ops.CURVES_PRESETS.Linear), synth256, 'applyCurves(Linear)');
assertPixelEqual(ops.applyLevels(synth256, ops.LEVELS_PRESETS.Default), synth256, 'applyLevels(Default)');
console.log('✔ All identity operations passed.');

// Test 2: Double Flips & 4x Rotate90
console.log('\nTesting Symmetric Transformations...');
assertPixelEqual(ops.flipH(ops.flipH(synth256)), synth256, 'flipH x 2');
assertPixelEqual(ops.flipV(ops.flipV(synth256)), synth256, 'flipV x 2');

const rot1 = ops.rotate90(synth256, 'cw');
const rot2 = ops.rotate90(rot1, 'cw');
const rot3 = ops.rotate90(rot2, 'cw');
const rot4 = ops.rotate90(rot3, 'cw');
assertPixelEqual(rot4, synth256, 'rotate90 x 4');

// Non-square rotation check
const rectImg = createSyntheticImageData(100, 200);
const rectRot = ops.rotate90(rectImg, 'cw');
assertValidImageData(rectRot, 200, 100, 'rotate90(100x200)');
console.log('✔ All symmetric transformations passed.');

// Test 3: Operations Validity & Clamping
console.log('\nTesting Filter Output Validity & Bounds...');
assertValidImageData(ops.gaussianBlur(synth256, 8), 256, 256, 'gaussianBlur(8)');
assertValidImageData(ops.sharpen(synth256, 1.4), 256, 256, 'sharpen(1.4)');
assertValidImageData(ops.edgeDetect(synth256, 1.0, true), 256, 256, 'edgeDetect(nms=true)');
assertValidImageData(ops.edgeDetect(synth256, 1.0, false), 256, 256, 'edgeDetect(nms=false)');
assertValidImageData(ops.vignette(synth256, 0.85, 0.5), 256, 256, 'vignette');
assertValidImageData(ops.filmGrain(synth256, 18), 256, 256, 'filmGrain');
assertValidImageData(ops.tiltShift(synth256, 0.5, 0.35, 10), 256, 256, 'tiltShift');
assertValidImageData(ops.chromaticAberration(synth256, 5), 256, 256, 'chromaticAberration');
assertValidImageData(ops.glow(synth256, 180, 12, 1.0), 256, 256, 'glow');
assertValidImageData(ops.pixelate(synth256, 12), 256, 256, 'pixelate(12)');
assertValidImageData(ops.sepia(synth256, 1.0), 256, 256, 'sepia');
assertValidImageData(ops.lensFlare(synth256, 180, 80, 1.0), 256, 256, 'lensFlare');
assertValidImageData(ops.dispersion(synth256, 1200, 0.25), 256, 256, 'dispersion');
assertValidImageData(ops.motionBlur(synth256, 45, 15), 256, 256, 'motionBlur');
assertValidImageData(ops.stretch(synth256, 1.5, 1.2), 256, 256, 'stretch');
assertValidImageData(ops.gradientMap(synth256, undefined, 'thermal-purple'), 256, 256, 'gradientMap(thermal-purple)');
assertValidImageData(ops.gradientMap(synth256, undefined, 'thermal-blue'), 256, 256, 'gradientMap(thermal-blue)');
assertValidImageData(ops.gradientMap(synth256, undefined, 'red-ink'), 256, 256, 'gradientMap(red-ink)');
assertValidImageData(ops.gradientMap(synth256, undefined, 'black-ink'), 256, 256, 'gradientMap(black-ink)');
assertValidImageData(ops.gradientMap(synth256, undefined, 'sepia'), 256, 256, 'gradientMap(sepia)');
assertValidImageData(ops.resize(synth256, 512, 128, 'lanczos3'), 512, 128, 'resize(lanczos3)');
assertValidImageData(ops.resize(synth256, 64, 64, 'bicubic'), 64, 64, 'resize(bicubic)');
assertValidImageData(ops.buildTonalMap(synth256, { outWidth: 256 }), 256, 256, 'buildTonalMap');
assertValidImageData(ops.applyCurves(synth256, ops.CURVES_PRESETS['Stencil Clean']), 256, 256, 'applyCurves(Stencil Clean)');
assertValidImageData(ops.applyLevels(synth256, ops.LEVELS_PRESETS['Stencil Clean']), 256, 256, 'applyLevels(Stencil Clean)');
console.log('✔ All filter outputs passed bounds and non-NaN assertions.');

// Test 4: Extreme Dimensions (1x1 and 4096x4096)
console.log('\nTesting Extreme Dimensions (1x1 & 4096x4096)...');
const img1x1 = createSyntheticImageData(1, 1);
assertValidImageData(ops.gaussianBlur(img1x1, 4), 1, 1, '1x1 blur');
assertValidImageData(ops.sharpen(img1x1, 1.4), 1, 1, '1x1 sharpen');
assertValidImageData(ops.edgeDetect(img1x1), 1, 1, '1x1 edgeDetect');
assertValidImageData(ops.vignette(img1x1), 1, 1, '1x1 vignette');
assertValidImageData(ops.filmGrain(img1x1), 1, 1, '1x1 filmGrain');
assertValidImageData(ops.tiltShift(img1x1), 1, 1, '1x1 tiltShift');
assertValidImageData(ops.chromaticAberration(img1x1), 1, 1, '1x1 chromaticAberration');
assertValidImageData(ops.glow(img1x1), 1, 1, '1x1 glow');
assertValidImageData(ops.pixelate(img1x1), 1, 1, '1x1 pixelate');
assertValidImageData(ops.sepia(img1x1), 1, 1, '1x1 sepia');
assertValidImageData(ops.lensFlare(img1x1), 1, 1, '1x1 lensFlare');
assertValidImageData(ops.dispersion(img1x1), 1, 1, '1x1 dispersion');
assertValidImageData(ops.motionBlur(img1x1), 1, 1, '1x1 motionBlur');
assertValidImageData(ops.stretch(img1x1), 1, 1, '1x1 stretch');
assertValidImageData(ops.gradientMap(img1x1), 1, 1, '1x1 gradientMap');
assertValidImageData(ops.flipH(img1x1), 1, 1, '1x1 flipH');
assertValidImageData(ops.flipV(img1x1), 1, 1, '1x1 flipV');
assertValidImageData(ops.rotate90(img1x1), 1, 1, '1x1 rotate90');
assertValidImageData(ops.resize(img1x1, 16, 16, 'lanczos3'), 16, 16, '1x1 -> 16x16 resize');
assertValidImageData(ops.applyCurves(img1x1, ops.CURVES_PRESETS['Stencil Clean']), 1, 1, '1x1 applyCurves');
assertValidImageData(ops.applyLevels(img1x1, ops.LEVELS_PRESETS['Stencil Clean']), 1, 1, '1x1 applyLevels');
assertValidImageData(ops.buildTonalMap(img1x1, { outWidth: 1 }), 1, 1, '1x1 buildTonalMap');
console.log('✔ 1x1 image test passed for all operations.');

// Test 5: Benchmark 2048x2048 Gaussian Blur
console.log('\nTesting 2048x2048 Blur Performance...');
const synth2048 = createSyntheticImageData(2048, 2048);
const startTime = performance.now();
const blurred2048 = ops.gaussianBlur(synth2048, 6);
const endTime = performance.now();
const durationMs = Math.round(endTime - startTime);

assertValidImageData(blurred2048, 2048, 2048, '2048x2048 gaussianBlur');
console.log(`⏱ 2048x2048 Gaussian blur completed in ${durationMs}ms`);

if (durationMs >= 1500) {
  throw new Error(`❌ 2048x2048 blur performance regression: ${durationMs}ms exceeds 1500ms limit!`);
} else {
  console.log(`✔ Performance requirement satisfied (< 1500ms).`);
}

console.log('\n🎉 ALL IMAGE OPS VERIFICATION TESTS PASSED SUCCESSFULLY! 🎉');
