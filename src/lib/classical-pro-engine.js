/**
 * ClassicalProEngine
 * -----------------
 * High-quality, fully client-side tattoo stencil engine.
 * Pipeline: CLAHE → Edge-preserving Bilateral → S-Curve Contrast →
 *           XDoG or Stochastic Stipple → Morphology Opening + Blob Filter →
 *           Structure Tensor flow (optional) → Line weight → Hectograph / Black
 *
 * Zero server cost. Runs on phone and desktop.
 *
 * 2026-08 update: aggressive noise suppression for thermal-paper ready output.
 */

class ClassicalProEngine {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    // Classic Spirit / hectograph thermal purple (approximate)
    this.hectographPurple = { r: 120, g: 0, b: 200 };
  }

  /**
   * Main entry
   * @param {HTMLImageElement|HTMLCanvasElement} imageSource
   * @param {Object} settings
   * @param {Object} [preset] - one entry from the calibration JSON
   */
  processImage(imageSource, settings = {}, preset = null) {
    // Merge preset numbers if provided
    const s = Object.assign({
      useClahe: true,
      shadingMode: 'xdog',          // 'xdog' | 'dither'
      skin_smoothness: 50,
      detail_radius: 1.0,
      edge_sensitivity: 0.98,
      shadow_block: 15,
      line_weight: 0,
      useStructureTensor: false,    // turn on for portraits / hair
      tensorRadius: 2,
      flowStrength: 0.65,
      outputPurple: true,

      // New cleaning controls (safe defaults – can be overridden by preset/settings)
      contrastStrength: 0.72,      // S-curve amount 0–1
      gamma: 0.78,                 // <1 pushes midtones darker
      openKernel: 3,               // morphological opening size (odd)
      minBlobArea: 6,              // kill dark blobs smaller than this
      closeKernel: 0,              // optional light close after cleaning
    }, preset || {}, settings);

    this.canvas.width = imageSource.width || imageSource.videoWidth;
    this.canvas.height = imageSource.height || imageSource.videoHeight;
    this.ctx.drawImage(imageSource, 0, 0);

    let img = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    // 1. Grayscale
    img = this.toGrayscale(img);

    // 2. CLAHE (simple tile-based approximation for browser)
    if (s.useClahe) {
      img = this.applyCLAHE(img, 8, 2.0);
    }

    // 3. Stronger edge-preserving bilateral (replaces previous light blur)
    img = this.bilateralApprox(img, s.skin_smoothness);

    // 4. Aggressive S-curve + gamma – collapses muddy midtones
    img = this.applySCurveAndGamma(img, s.contrastStrength, s.gamma);

    let stencil;

    if (s.shadingMode === 'dither') {
      // Clean closed contour lines from XDoG
      const contourLines = this.applyXDoG(img, Math.max(0.8, s.detail_radius), s.edge_sensitivity, Math.max(9, s.shadow_block));
      // Stochastic (blue-noise-style) stippling
      const stipple = this.stochasticStipple(img, {
        minRadius: 0.55,
        maxRadius: 2.4,
        spacing: Math.max(2, Math.round(s.detail_radius * 2.5)),
      });
      stencil = this.combineEdgeAndDither(contourLines, stipple);
    } else {
      // XDoG path
      stencil = this.applyXDoG(img, s.detail_radius, s.edge_sensitivity, s.shadow_block);
    }

    // 5. Structure Tensor flow modulation (Portrait / Hair)
    if (s.useStructureTensor) {
      const tensor = this.computeStructureTensor(img, s.tensorRadius);
      stencil = this.applyFlowModulation(stencil, tensor, s.flowStrength);
    }

    // 6. Morphological opening (erode → dilate) + minimum-area blob filter
    //    This is the primary dust / high-frequency noise killer.
    if (s.openKernel >= 3) {
      stencil = this.morphology(stencil, s.openKernel, 'open');
    }
    if (s.minBlobArea > 0) {
      stencil = this.removeSmallBlobs(stencil, s.minBlobArea);
    }
    // Optional light close to reconnect thin structural lines that may have been nicked
    if (s.closeKernel >= 3) {
      stencil = this.morphology(stencil, s.closeKernel, 'close');
    }

    // 7. Morphological line weight (existing behaviour)
    if (s.line_weight !== 0) {
      stencil = this.dilateErode(stencil, s.line_weight);
    }

    // 8. Optional hectograph purple
    if (s.outputPurple) {
      stencil = this.mapToHectographPurple(stencil);
    } else {
      // Keep pure black lines on transparent
      stencil = this.makeTransparentBackground(stencil);
    }

    this.ctx.putImageData(stencil, 0, 0);
    return this.canvas.toDataURL('image/png');
  }

  // ---------- Core helpers ----------

  toGrayscale(imageData) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = d[i + 1] = d[i + 2] = g;
    }
    return imageData;
  }

  /** Simple CLAHE approximation (tile histogram equalization) */
  applyCLAHE(imageData, tileSize = 8, clipLimit = 2.0) {
    const { width, height, data } = imageData;
    const out = new ImageData(width, height);
    const outData = out.data;

    // Lightweight global + local blend (full per-tile CLAHE is heavier on mobile)
    const hist = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) hist[data[i]]++;

    const total = width * height;
    const clipped = hist.map(v => Math.min(v, (total / 256) * clipLimit));
    const excess = hist.reduce((a, b, i) => a + (hist[i] - clipped[i]), 0);
    const extra = excess / 256;
    for (let i = 0; i < 256; i++) clipped[i] += extra;

    const cdf = new Array(256);
    cdf[0] = clipped[0];
    for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + clipped[i];
    const cdfMin = cdf.find(v => v > 0) || 0;

    for (let i = 0; i < data.length; i += 4) {
      const v = data[i];
      const eq = Math.round(((cdf[v] - cdfMin) / Math.max(1, (total - cdfMin))) * 255);
      outData[i] = outData[i + 1] = outData[i + 2] = eq;
      outData[i + 3] = 255;
    }
    return out;
  }

  /**
   * Improved edge-preserving bilateral approximation.
   * Separable spatial blur + range weighting so shading noise is smoothed
   * while primary structural edges stay razor sharp.
   */
  bilateralApprox(imageData, strength) {
    const radius = Math.max(1, Math.round(strength / 22));
    const spatial = this.fastBlur(imageData, radius);
    const { width, height, data } = imageData;
    const out = new ImageData(width, height);
    const o = out.data;
    const sData = spatial.data;
    const inv = 1 / (strength * 0.55 + 8);

    for (let i = 0; i < data.length; i += 4) {
      const orig = data[i];
      const blur = sData[i];
      const diff = Math.abs(orig - blur);
      const weight = Math.exp(-diff * inv);          // range kernel
      const v = orig * (1 - weight) + blur * weight;
      o[i] = o[i + 1] = o[i + 2] = v;
      o[i + 3] = 255;
    }
    return out;
  }

  /**
   * Aggressive contrast S-curve + gamma.
   * Forces muddy dark grays → solid black and weak light grays → clean white.
   */
  applySCurveAndGamma(imageData, contrast = 0.72, gamma = 0.78) {
    const { width, height, data } = imageData;
    const out = new ImageData(width, height);
    const o = out.data;
    const lut = new Uint8ClampedArray(256);

    for (let i = 0; i < 256; i++) {
      let v = i / 255;
      // Smooth S-curve
      if (v < 0.5) {
        v = 0.5 * Math.pow(2 * v, 1 + contrast * 2.2);
      } else {
        v = 1 - 0.5 * Math.pow(2 * (1 - v), 1 + contrast * 2.2);
      }
      // Gamma (< 1 darkens midtones – helps solid blacks on thermal)
      v = Math.pow(Math.max(0, Math.min(1, v)), gamma);
      lut[i] = (v * 255 + 0.5) | 0;
    }

    for (let i = 0; i < data.length; i += 4) {
      const v = lut[data[i]];
      o[i] = o[i + 1] = o[i + 2] = v;
      o[i + 3] = 255;
    }
    return out;
  }

  applyXDoG(imageData, detailRadius, edgeSensitivity, shadowBlock) {
    const sigma1 = detailRadius;
    const sigma2 = sigma1 * 2.0;

    const g1 = this.fastBlur(imageData, sigma1);
    const g2 = this.fastBlur(imageData, sigma2);

    const { width, height } = imageData;
    const out = new ImageData(width, height);
    const d1 = g1.data, d2 = g2.data, o = out.data;

    for (let i = 0; i < d1.length; i += 4) {
      const val = d1[i] - edgeSensitivity * d2[i];
      let v = Math.max(0, Math.min(255, val + 128));
      o[i] = o[i + 1] = o[i + 2] = v;
      o[i + 3] = 255;
    }

    return this.adaptiveThreshold(out, shadowBlock);
  }

  adaptiveThreshold(imageData, blockSize) {
    if (blockSize % 2 === 0) blockSize += 1;
    const { width, height, data } = imageData;
    const out = new ImageData(width, height);
    const o = out.data;
    const half = Math.floor(blockSize / 2);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0, count = 0;
        for (let dy = -half; dy <= half; dy++) {
          for (let dx = -half; dx <= half; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              sum += data[(ny * width + nx) * 4];
              count++;
            }
          }
        }
        const mean = sum / count;
        const idx = (y * width + x) * 4;
        const v = data[idx] < mean - 5 ? 0 : 255;
        o[idx] = o[idx + 1] = o[idx + 2] = v;
        o[idx + 3] = 255;
      }
    }
    return out;
  }

  /**
   * Stochastic (blue-noise-style) stippling.
   * Places dots on a jittered grid; density driven by local darkness.
   */
  stochasticStipple(imageData, opts = {}) {
    const { width, height, data } = imageData;
    const minRadius = opts.minRadius ?? 0.6;
    const maxRadius = opts.maxRadius ?? 2.2;
    const baseSpacing = opts.spacing ?? 4;

    const scale = Math.max(0.5, Math.min(width, height) / 1024);
    const spacing = Math.max(2, baseSpacing * scale);
    const minR = minRadius * scale;
    const maxR = maxRadius * scale;

    const out = new ImageData(width, height);
    const o = out.data;
    for (let i = 0; i < o.length; i += 4) {
      o[i] = o[i + 1] = o[i + 2] = 255;
      o[i + 3] = 255;
    }

    let seed = (width * 73856093) ^ (height * 19349663) ^ 0x9e3779b9;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const drawDot = (cx, cy, r) => {
      if (r < 0.35) return;
      const rInt = Math.ceil(r);
      const cxi = Math.round(cx), cyi = Math.round(cy);
      for (let dy = -rInt; dy <= rInt; dy++) {
        const ny = cyi + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -rInt; dx <= rInt; dx++) {
          const nx = cxi + dx;
          if (nx < 0 || nx >= width) continue;
          if (dx * dx + dy * dy > r * r) continue;
          const idx = (ny * width + nx) * 4;
          o[idx] = o[idx + 1] = o[idx + 2] = 0;
        }
      }
    };

    for (let y = -spacing; y < height + spacing; y += spacing) {
      for (let x = -spacing; x < width + spacing; x += spacing) {
        const jx = x + (rand() - 0.5) * spacing * 0.9;
        const jy = y + (rand() - 0.5) * spacing * 0.9;
        const sx = Math.min(width - 1, Math.max(0, Math.round(jx)));
        const sy = Math.min(height - 1, Math.max(0, Math.round(jy)));
        const lum = data[(sy * width + sx) * 4];
        const darkness = 1 - lum / 255;
        if (darkness <= 0.02) continue;

        const gamma = Math.pow(darkness, 0.75);
        if (rand() > gamma) continue;

        const radius = minR + (maxR - minR) * gamma * (0.75 + rand() * 0.5);
        drawDot(jx, jy, radius);
      }
    }

    return out;
  }

  combineEdgeAndDither(edges, dither) {
    const { width, height } = edges;
    const out = new ImageData(width, height);
    const e = edges.data, d = dither.data, o = out.data;
    for (let i = 0; i < e.length; i += 4) {
      const v = (e[i] < 128 || d[i] < 128) ? 0 : 255;
      o[i] = o[i + 1] = o[i + 2] = v;
      o[i + 3] = 255;
    }
    return out;
  }

  computeStructureTensor(imageData, radius = 2) {
    const { width, height, data } = imageData;
    const tensor = new Float32Array(width * height * 2);

    const gx = new Float32Array(width * height);
    const gy = new Float32Array(width * height);

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = y * width + x;
        gx[i] =
          -data[((y - 1) * width + (x - 1)) * 4] - 2 * data[(y * width + (x - 1)) * 4] - data[((y + 1) * width + (x - 1)) * 4] +
           data[((y - 1) * width + (x + 1)) * 4] + 2 * data[(y * width + (x + 1)) * 4] + data[((y + 1) * width + (x + 1)) * 4];
        gy[i] =
          -data[((y - 1) * width + (x - 1)) * 4] - 2 * data[((y - 1) * width + x) * 4] - data[((y - 1) * width + (x + 1)) * 4] +
           data[((y + 1) * width + (x - 1)) * 4] + 2 * data[((y + 1) * width + x) * 4] + data[((y + 1) * width + (x + 1)) * 4];
      }
    }

    const blur = (src, r) => {
      const out = new Float32Array(src.length);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let sum = 0, c = 0;
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                sum += src[ny * width + nx];
                c++;
              }
            }
          }
          out[y * width + x] = sum / c;
        }
      }
      return out;
    };

    const gxx = blur(Float32Array.from(gx.map(v => v * v)), radius);
    const gyy = blur(Float32Array.from(gy.map(v => v * v)), radius);
    const gxy = blur(Float32Array.from(gx.map((v, i) => v * gy[i])), radius);

    for (let i = 0; i < width * height; i++) {
      const xx = gxx[i], yy = gyy[i], xy = gxy[i];
      const lambda1 = 0.5 * (xx + yy + Math.sqrt((xx - yy) ** 2 + 4 * xy * xy));
      const lambda2 = 0.5 * (xx + yy - Math.sqrt((xx - yy) ** 2 + 4 * xy * xy));
      const coherence = (lambda1 + lambda2) > 1e-6 ? (lambda1 - lambda2) / (lambda1 + lambda2) : 0;
      const angle = Math.atan2(2 * xy, xx - yy) * 0.5;
      tensor[i * 2] = coherence;
      tensor[i * 2 + 1] = angle;
    }
    return { tensor, width, height };
  }

  applyFlowModulation(edges, tensorData, strength) {
    if (strength <= 0) return edges;
    const { tensor, width, height } = tensorData;
    const data = edges.data;
    const out = new ImageData(width, height);
    const o = out.data;

    for (let i = 0; i < width * height; i++) {
      const coherence = tensor[i * 2];
      const idx = i * 4;
      const mod = 1 - strength * coherence * 0.45;
      const v = Math.max(0, Math.min(255, data[idx] * mod));
      o[idx] = o[idx + 1] = o[idx + 2] = v;
      o[idx + 3] = 255;
    }
    return out;
  }

  /**
   * Morphological open / close.
   * open  = erode then dilate  → removes small dark speckles
   * close = dilate then erode  → fills small gaps in lines
   */
  morphology(imageData, ksize, op = 'open') {
    const kernel = Math.max(3, ksize | 1); // force odd
    const r = (kernel - 1) >> 1;
    const { width, height, data } = imageData;

    const erode = (src) => {
      const dst = new Uint8ClampedArray(src.length);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let minV = 255;
          for (let ky = -r; ky <= r; ky++) {
            for (let kx = -r; kx <= r; kx++) {
              const yy = Math.max(0, Math.min(height - 1, y + ky));
              const xx = Math.max(0, Math.min(width - 1, x + kx));
              minV = Math.min(minV, src[(yy * width + xx) * 4]);
            }
          }
          const idx = (y * width + x) * 4;
          dst[idx] = dst[idx + 1] = dst[idx + 2] = minV;
          dst[idx + 3] = 255;
        }
      }
      return dst;
    };

    const dilate = (src) => {
      const dst = new Uint8ClampedArray(src.length);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          let maxV = 0;
          for (let ky = -r; ky <= r; ky++) {
            for (let kx = -r; kx <= r; kx++) {
              const yy = Math.max(0, Math.min(height - 1, y + ky));
              const xx = Math.max(0, Math.min(width - 1, x + kx));
              maxV = Math.max(maxV, src[(yy * width + xx) * 4]);
            }
          }
          const idx = (y * width + x) * 4;
          dst[idx] = dst[idx + 1] = dst[idx + 2] = maxV;
          dst[idx + 3] = 255;
        }
      }
      return dst;
    };

    const srcArr = data;
    const resultArr = op === 'open' ? dilate(erode(srcArr)) : erode(dilate(srcArr));

    const out = new ImageData(width, height);
    out.data.set(resultArr);
    return out;
  }

  /**
   * Connected-component area filter.
   * Removes isolated dark pixel clusters smaller than minArea.
   * 4-connected for speed; sufficient for dust / paper texture.
   */
  removeSmallBlobs(imageData, minArea = 6) {
    const { width, height, data } = imageData;
    const visited = new Uint8Array(width * height);
    const out = new ImageData(new Uint8ClampedArray(data), width, height);
    const o = out.data;
    const stack = [];

    const dirs = [-1, 1, -width, width];

    for (let i = 0; i < width * height; i++) {
      if (data[i * 4] >= 128 || visited[i]) continue; // only dark (ink) blobs

      stack.length = 0;
      stack.push(i);
      visited[i] = 1;
      let area = 0;
      const pixels = [];

      while (stack.length) {
        const p = stack.pop();
        pixels.push(p);
        area++;

        const x = p % width;
        for (const d of dirs) {
          const np = p + d;
          if (np < 0 || np >= width * height) continue;
          const nx = np % width;
          if (Math.abs(nx - x) > 1) continue; // prevent horizontal wrap
          if (data[np * 4] < 128 && !visited[np]) {
            visited[np] = 1;
            stack.push(np);
          }
        }
      }

      // Kill small dark blobs → turn them white
      if (area < minArea) {
        for (const p of pixels) {
          const idx = p * 4;
          o[idx] = o[idx + 1] = o[idx + 2] = 255;
          o[idx + 3] = 255;
        }
      }
    }
    return out;
  }

  dilateErode(imageData, amount) {
    if (amount === 0) return imageData;
    const { width, height, data } = imageData;
    const out = new ImageData(width, height);
    const o = out.data;
    const r = Math.abs(amount);
    const isDilate = amount > 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let val = isDilate ? 255 : 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const v = data[(ny * width + nx) * 4];
              if (isDilate) val = Math.min(val, v);
              else val = Math.max(val, v);
            }
          }
        }
        const idx = (y * width + x) * 4;
        o[idx] = o[idx + 1] = o[idx + 2] = val;
        o[idx + 3] = 255;
      }
    }
    return out;
  }

  mapToHectographPurple(imageData) {
    const d = imageData.data;
    const { r, g, b } = this.hectographPurple;
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

  makeTransparentBackground(imageData) {
    const d = imageData.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] >= 128) {
        d[i] = d[i + 1] = d[i + 2] = 255;
        d[i + 3] = 0;
      } else {
        d[i] = d[i + 1] = d[i + 2] = 0;
        d[i + 3] = 255;
      }
    }
    return imageData;
  }

  fastBlur(imageData, radius) {
    const r = Math.max(1, Math.round(radius));
    const { width, height, data } = imageData;
    const out = new ImageData(width, height);
    const o = out.data;

    // Separable box blur for better performance
    const tmp = new Float32Array(width * height);

    // Horizontal
    for (let y = 0; y < height; y++) {
      let sum = 0;
      for (let x = -r; x <= r; x++) {
        const xx = Math.max(0, Math.min(width - 1, x));
        sum += data[(y * width + xx) * 4];
      }
      for (let x = 0; x < width; x++) {
        tmp[y * width + x] = sum / (2 * r + 1);
        const x1 = Math.max(0, Math.min(width - 1, x - r));
        const x2 = Math.max(0, Math.min(width - 1, x + r + 1));
        sum += data[(y * width + x2) * 4] - data[(y * width + x1) * 4];
      }
    }

    // Vertical
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) {
        const yy = Math.max(0, Math.min(height - 1, y));
        sum += tmp[yy * width + x];
      }
      for (let y = 0; y < height; y++) {
        const v = sum / (2 * r + 1);
        const idx = (y * width + x) * 4;
        o[idx] = o[idx + 1] = o[idx + 2] = v;
        o[idx + 3] = 255;
        const y1 = Math.max(0, Math.min(height - 1, y - r));
        const y2 = Math.max(0, Math.min(height - 1, y + r + 1));
        sum += tmp[y2 * width + x] - tmp[y1 * width + x];
      }
    }
    return out;
  }
}

// Browser / module export
if (typeof window !== 'undefined') {
  window.ClassicalProEngine = ClassicalProEngine;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ClassicalProEngine };
}

export { ClassicalProEngine };
export default ClassicalProEngine;
