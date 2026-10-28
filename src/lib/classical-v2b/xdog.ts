import { gaussian } from "./filters";
import { clamp, percentile } from "./fieldops";

export interface XDoGParams {
  sigma: number;
  k: number;
  p: number;
  epsilon: number;
  phi: number;
  gamma: number;
}

export const DEFAULT_XDOG: XDoGParams = {
  sigma: 1.2,
  k: 1.6,
  p: 19,
  epsilon: 0,
  phi: 10,
  gamma: 1,
};

export function xdogInk(
  tone: Float32Array,
  width: number,
  height: number,
  parameters: Partial<XDoGParams> = {},
  localAmount = 0.5,
  /** Long edge / 1024. Scales the local-contrast window so it covers the same picture area at any size. */
  scale = 1,
): Float32Array {
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("Invalid XDoG scale");
  }

  const q = {
    ...DEFAULT_XDOG,
    ...parameters,
  };

  const near = gaussian(
    tone,
    width,
    height,
    q.sigma,
  );

  const far = gaussian(
    tone,
    width,
    height,
    q.sigma * q.k,
  );

  const response = new Float32Array(tone.length);

  for (let i = 0; i < response.length; i++) {
    response[i] =
      (1 + q.p) * near[i] -
      q.p * far[i];
  }

  let gains: Float32Array | undefined;

  if (localAmount > 0) {
    const squared = new Float32Array(response.length);

    for (let i = 0; i < squared.length; i++) {
      squared[i] = response[i] * response[i];
    }

    const energy = gaussian(
      squared,
      width,
      height,
      (25 / 3) * scale,
    );

    for (let i = 0; i < energy.length; i++) {
      energy[i] = Math.sqrt(energy[i]) + 1e-3;
    }

    const reference = percentile(energy, 0.75);
    gains = new Float32Array(response.length);

    for (let i = 0; i < gains.length; i++) {
      const gain = clamp(reference / energy[i], 1, 4);

      gains[i] =
        1 + (gain - 1) * clamp(localAmount, 0, 1);
    }
  }

  const ink = new Float32Array(response.length);

  for (let i = 0; i < ink.length; i++) {
    const d = response[i] * (gains?.[i] ?? 1);

    const paper =
      d >= q.epsilon
        ? 1
        : 1 + Math.tanh(q.phi * (d - q.epsilon));

    ink[i] = Math.pow(
      1 - clamp(paper, 0, 1),
      q.gamma,
    );
  }

  return ink;
}
