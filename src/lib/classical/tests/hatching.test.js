import { renderHatchLayer } from '../../classical-engine/hatching.ts';

const params = {
  baseAngle: Math.PI / 2, followForm: false,
  minSpacingPx: 4, maxSpacingPx: 12, lineWidthPx: 1.5, crosshatch: false,
};
const assert = (condition, message) => { if (!condition) throw new Error(message); };

export function runAllTests() {
  const measurements = {};
  const testCases = {
    'ramp coverage and pure highlights': () => {
      const w = 512, h = 256, tone = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tone[y * w + x] = 255 * (1 - x / (w - 1));
      const ink = renderHatchLayer(tone, null, w, h, params);
      const bands = Array(8).fill(0);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ink[y * w + x]) bands[Math.floor(x / 64)]++;
      measurements.rampCoverage = bands.map(n => n / (64 * h));
      assert(bands[0] === 0, 'Brightest band contains ink');
      for (let i = 1; i < bands.length; i++) assert(bands[i] >= bands[i - 1], `Coverage decreased at band ${i}`);
      assert(bands[7] > 0, 'Dark ramp has no ink');
    },
    'radial strokes follow tangent field': () => {
      const w = 256, h = 256, tone = new Float32Array(w * h), ori = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const i = y * w + x, dx = x + 0.5 - w / 2, dy = y + 0.5 - h / 2;
        tone[i] = 255 * Math.min(1, Math.hypot(dx, dy) / 150);
        ori[i] = Math.atan2(dy, dx) + Math.PI / 2;
      }
      const ink = renderHatchLayer(tone, ori, w, h, { ...params, followForm: true });
      let error = 0, samples = 0;
      for (let y = 8; y < h - 8; y++) for (let x = 8; x < w - 8; x++) {
        if (!ink[y * w + x] || Math.hypot(x - 128, y - 128) < 20) continue;
        let xx = 0, yy = 0, xy = 0, count = 0, sx = 0, sy = 0;
        for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (ink[(y + dy) * w + x + dx]) {
          xx += dx * dx; yy += dy * dy; xy += dx * dy; sx += dx; sy += dy; count++;
        }
        if (count < 5) continue;
        xx -= sx * sx / count; yy -= sy * sy / count; xy -= sx * sy / count;
        const anisotropy = Math.hypot(xx - yy, 2 * xy) / Math.max(1e-6, xx + yy);
        if (anisotropy < 0.6) continue;
        const angle = Math.atan2(2 * xy, xx - yy) / 2;
        error += Math.acos(Math.min(1, Math.abs(Math.cos(angle - ori[y * w + x])))); samples++;
      }
      measurements.radialErrorDegrees = error / samples * 180 / Math.PI;
      assert(samples > 100, 'Insufficient radial stroke samples');
      assert(measurements.radialErrorDegrees < 15, `Angular error ${measurements.radialErrorDegrees}`);
    },
    'mid-gray remains sparse and evenly separated': () => {
      const w = 384, h = 256, tone = new Float32Array(w * h).fill(128);
      const ink = renderHatchLayer(tone, null, w, h, params);
      measurements.midgrayCoverage = ink.reduce((s, v) => s + (v > 0 ? 1 : 0), 0) / ink.length;
      assert(measurements.midgrayCoverage > 0 && measurements.midgrayCoverage < 0.35, 'Mid-gray flooding or empty');
      const gaps = [];
      for (let y = 64; y < h - 64; y += 32) {
        const centers = [];
        for (let x = 16; x < w - 16; x++) {
          if (!ink[y * w + x]) continue;
          const start = x;
          while (x + 1 < w - 16 && ink[y * w + x + 1]) x++;
          centers.push((start + x) / 2);
        }
        for (let i = 1; i < centers.length; i++) gaps.push(centers[i] - centers[i - 1]);
      }
      const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
      measurements.separationCV = Math.sqrt(gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length) / mean;
      assert(gaps.length > 20 && measurements.separationCV < 0.3, `Spacing variation ${measurements.separationCV}`);
    },
    'legacy and streamline preserve contract and determinism': () => {
      const tone = new Float32Array(128 * 96).fill(90);
      for (const mode of ['legacy', 'streamline']) {
        const a = renderHatchLayer(tone, null, 128, 96, { ...params, mode, crosshatch: true });
        const b = renderHatchLayer(tone, null, 128, 96, { ...params, mode, crosshatch: true });
        assert(a instanceof Uint8ClampedArray && a.length === tone.length, `${mode} contract changed`);
        assert(a.every((v, i) => (v === 0 || v === 255) && v === b[i]), `${mode} nondeterministic/nonbinary`);
      }
    },
    'crosshatch is restricted to deeper tone layers': () => {
      const tone = new Float32Array(128 * 96).fill(170);
      const a = renderHatchLayer(tone, null, 128, 96, { ...params, crosshatch: false });
      const b = renderHatchLayer(tone, null, 128, 96, { ...params, crosshatch: true });
      assert(a.every((v, i) => v === b[i]), 'Crosshatch leaked into light midtones');
    },
    'large-image downsample path is deterministic and binary': () => {
      const w = 1500, h = 1400, tone = new Float32Array(w * h).fill(255);
      const a = renderHatchLayer(tone, null, w, h, params);
      const b = renderHatchLayer(tone, null, w, h, params);
      assert(a.length === w * h && a.every((v, i) => v === 0 && v === b[i]), 'Large white field changed');
    },
  };
  let passed = 0;
  const failures = [];
  for (const [name, test] of Object.entries(testCases)) {
    try { test(); passed++; } catch (error) { failures.push(`${name}: ${error.message}`); }
  }
  return { passed, failed: failures.length, failures, measurements };
}

export function benchmarkHatching() {
  const w = 1600, h = 1200, tone = new Float32Array(w * h), ori = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    tone[i] = 255 * x / (w - 1);
    ori[i] = Math.PI / 2 + 0.15 * Math.sin(y / 100);
  }
  const start = performance.now();
  const ink = renderHatchLayer(tone, ori, w, h, { ...params, followForm: true, crosshatch: true });
  return { milliseconds: performance.now() - start, inkPixels: ink.reduce((s, v) => s + (v > 0 ? 1 : 0), 0) };
}