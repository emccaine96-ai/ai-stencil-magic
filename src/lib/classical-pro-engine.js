/**
 * ClassicalProEngine
 * -----------------
 * High-quality, fully client-side tattoo stencil engine.
 * Pipeline: CLAHE → Bilateral → XDoG or Floyd-Steinberg Dither → Morphology
 * + Structure Tensor flow modulation for Portrait / Hair styles
 * + Hectograph purple output
 * + Full support for the 50+ subject-type preset library
 *
 * Zero server cost. Runs on phone and desktop.
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
      outputPurple: true
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

    // 3. Bilateral-style smoothing (approximated with guided blur for speed)
    img = this.bilateralApprox(img, s.skin_smoothness);

    let stencil;

    if (s.shadingMode === 'dither') {
      // Clean closed contour lines from XDoG (same quality source as line styles)
      const contourLines = this.applyXDoG(img, Math.max(0.8, s.detail_radius), s.edge_sensitivity, Math.max(9, s.shadow_block));
      // Stochastic (blue-noise-style) stippling — replaces Floyd-Steinberg to avoid
      // diagonal "worm" streak artifacts and produce clean, organic dot density
      // graded by local darkness, like real hand-stippled dotwork.
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

    // 4. Structure Tensor flow modulation (Portrait / Hair)
    if (s.useStructureTensor) {
      const tensor = this.computeStructureTensor(img, s.tensorRadius);
      stencil = this.applyFlowModulation(stencil, tensor, s.flowStrength);
    }

    // 5. Morphological line weight
    if (s.line_weight !== 0) {
      stencil = this.dilateErode(stencil, s.line_weight);
    }

    // 6. Optional hectograph purple
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

    const tilesX = Math.ceil(width / tileSize);
    const tilesY = Math.ceil(height / tileSize);

    // For speed we do a lighter global + local blend instead of full CLAHE
    // (Full per-tile CLAHE is possible but heavier on mobile)
    const hist = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) hist[data[i]]++;

    // Clip and build CDF
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

  bilateralApprox(imageData, strength) {
    // Fast approximation: light Gaussian + edge-preserving mix
    const radius = Math.max(1, Math.round(strength / 25));
    return this.fastBlur(imageData, radius);
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
      // Normalize roughly into 0-255 range
      let v = Math.max(0, Math.min(255, val + 128));
      o[i] = o[i + 1] = o[i + 2] = v;
      o[i + 3] = 255;
    }

    // Adaptive-style threshold (simplified)
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

  floydSteinbergDither(imageData) {
    const { width, height, data } = imageData;
    const copy = new Float32Array(width * height);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) copy[p] = data[i];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const old = copy[i];
        const neu = old < 128 ? 0 : 255;
        copy[i] = neu;
        const err = old - neu;

        if (x + 1 < width) copy[i + 1] += err * 7 / 16;
        if (y + 1 < height) {
          if (x > 0) copy[i + width - 1] += err * 3 / 16;
          copy[i + width] += err * 5 / 16;
          if (x + 1 < width) copy[i + width + 1] += err * 1 / 16;
        }
      }
    }

    const out = new ImageData(width, height);
    const o = out.data;
    for (let i = 0, p = 0; i < o.length; i += 4, p++) {
      const v = copy[p] < 128 ? 0 : 255;
      o[i] = o[i + 1] = o[i + 2] = v;
      o[i + 3] = 255;
    }
    return out;
  }

  /**
   * Stochastic (blue-noise-style) stippling.
   * Places dots on a jittered grid; each dot's existence probability and
   * radius are driven by local darkness (gamma-shaped for contrast), with
   * per-cell jitter + a seeded PRNG so density reads as organic dot texture
   * instead of the mechanical streaks/worms Floyd-Steinberg produces.
   * Resolution-independent: spacing/radius scale with image size.
   */
  stochasticStipple(imageData, opts = {}) {
    const { width, height, data } = imageData;
    const minRadius = opts.minRadius ?? 0.6;
    const maxRadius = opts.maxRadius ?? 2.2;
    const baseSpacing = opts.spacing ?? 4;

    // Scale spacing/radius relative to a 1024px reference so density looks
    // consistent whether exporting at 1K or 8K.
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

    // Deterministic seeded PRNG (LCG) so re-runs on the same image are stable
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
        // Jitter each candidate point within its cell to break grid regularity
        const jx = x + (rand() - 0.5) * spacing * 0.9;
        const jy = y + (rand() - 0.5) * spacing * 0.9;
        const sx = Math.min(width - 1, Math.max(0, Math.round(jx)));
        const sy = Math.min(height - 1, Math.max(0, Math.round(jy)));
        const lum = data[(sy * width + sx) * 4];
        const darkness = 1 - lum / 255;
        if (darkness <= 0.02) continue;

        // Gamma-shape darkness so shadows read dense and highlights stay sparse
        const gamma = Math.pow(darkness, 0.75);

        // Density-first: probability a dot exists at all scales with darkness
        if (rand() > gamma) continue;

        // Radius scales with darkness for depth, plus slight jitter for
        // organic, hand-stippled variation instead of uniform dot size
        const radius = minR + (maxR - minR) * gamma * (0.75 + rand() * 0.5);
        drawDot(jx, jy, radius);
      }
    }

    return out;
  }

  simpleEdges(imageData) {
    // Lightweight Sobel for combining with dither
    const { width, height, data } = imageData;
    const out = new ImageData(width, height);
    const o = out.data;

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const gx =
          -data[((y - 1) * width + (x - 1)) * 4] - 2 * data[(y * width + (x - 1)) * 4] - data[((y + 1) * width + (x - 1)) * 4] +
           data[((y - 1) * width + (x + 1)) * 4] + 2 * data[(y * width + (x + 1)) * 4] + data[((y + 1) * width + (x + 1)) * 4];
        const gy =
          -data[((y - 1) * width + (x - 1)) * 4] - 2 * data[((y - 1) * width + x) * 4] - data[((y - 1) * width + (x + 1)) * 4] +
           data[((y + 1) * width + (x - 1)) * 4] + 2 * data[((y + 1) * width + x) * 4] + data[((y + 1) * width + (x + 1)) * 4];
        const mag = Math.sqrt(gx * gx + gy * gy);
        const v = mag > 40 ? 0 : 255;
        const idx = (y * width + x) * 4;
        o[idx] = o[idx + 1] = o[idx + 2] = v;
        o[idx + 3] = 255;
      }
    }
    return out;
  }

  combineEdgeAndDither(edges, dither) {
    const { width, height } = edges;
    const out = new ImageData(width, height);
    const e = edges.data, d = dither.data, o = out.data;
    for (let i = 0; i < e.length; i += 4) {
      // Black if either edge or dither says black
      const v = (e[i] < 128 || d[i] < 128) ? 0 : 255;
      o[i] = o[i + 1] = o[i + 2] = v;
      o[i + 3] = 255;
    }
    return out;
  }

  computeStructureTensor(imageData, radius = 2) {
    const { width, height, data } = imageData;
    const tensor = new Float32Array(width * height * 2); // coherence, angle

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

    // Simple box blur of tensor components
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

  dilateErode(imageData, amount) {
    if (amount === 0) return imageData;
    const { width, height, data } = imageData;
    const out = new ImageData(width, height);
    const o = out.data;
    const r = Math.abs(amount);
    const isDilate = amount > 0; // for black lines on white, dilate black = erode white

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

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0, c = 0;
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              sum += data[(ny * width + nx) * 4];
              c++;
            }
          }
        }
        const idx = (y * width + x) * 4;
        const v = sum / c;
        o[idx] = o[idx + 1] = o[idx + 2] = v;
        o[idx + 3] = 255;
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
