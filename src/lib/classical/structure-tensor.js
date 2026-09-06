/**
 * Structure Tensor computation + flow modulation for portrait/hair directionality.
 * Extracted from ClassicalProEngine for modularity.
 */

export function computeStructureTensor(imageData, radius = 2) {
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

export function applyFlowModulation(edges, tensorData, strength) {
  if (strength <= 0) return edges;
  const { tensor, width, height } = tensorData;
  const data = edges.data;
  const out = new ImageData(width, height);
  const o = out.data;

  // Coherence-gated tangent averaging (audit Fix #2, confirmed 2026-09-06):
  // tensor[i*2+1] (angle) was computed every call but never read anywhere in
  // the repo -- applyFlowModulation only used tensor[i*2] (coherence), and
  // hatching.ts's separate flow-guided-hatching module computes its own
  // independent tensor from scratch rather than consuming this one. In
  // regions with a clear, reliable directional structure (hair strands,
  // fabric weave), pull each pixel's value toward the average along its own
  // flow tangent instead of only damping intensity. Below COHERENCE_GATE,
  // the angle estimate is noisy/unreliable, so behavior stays identical to
  // before (damping only) -- this only adds behavior, never removes the
  // prior damping path.
  const TANGENT_SAMPLES = 2;
  const COHERENCE_GATE = 0.35;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const coherence = tensor[i * 2];
      const angle = tensor[i * 2 + 1];
      const idx = i * 4;
      const mod = 1 - strength * coherence * 0.45; // unchanged
      let value = data[idx] * mod;

      if (coherence > COHERENCE_GATE) {
        const dx = Math.cos(angle), dy = Math.sin(angle);
        let sum = data[idx], count = 1;
        for (let s = 1; s <= TANGENT_SAMPLES; s++) {
          const p1x = Math.round(x + dx * s), p1y = Math.round(y + dy * s);
          const p2x = Math.round(x - dx * s), p2y = Math.round(y - dy * s);
          if (p1x >= 0 && p1x < width && p1y >= 0 && p1y < height) { sum += data[(p1y * width + p1x) * 4]; count++; }
          if (p2x >= 0 && p2x < width && p2y >= 0 && p2y < height) { sum += data[(p2y * width + p2x) * 4]; count++; }
        }
        const tangentAvg = sum / count;
        value = value * (1 - coherence * 0.5) + tangentAvg * mod * (coherence * 0.5);
      }
      const v = Math.max(0, Math.min(255, value));
      o[idx] = o[idx + 1] = o[idx + 2] = v;
      o[idx + 3] = 255;
    }
  }
  return out;
}
