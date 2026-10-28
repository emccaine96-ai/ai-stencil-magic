import {
  clamp,
  hash01,
  sampleBilinear,
  smoothstep,
  validateSize,
  valueNoise,
} from "./fieldops";

export interface HatchOptions {
  levels: number[];
  spacing: [number, number];
  width: number;
  opacity: number;
  onset: number;
  taper: number;
  maxLengthFrac: number;
  tierFalloff: number;
  crossAngles: number[];
  crossWobble: number;
  seed: number;
  flatAngle: number;
  gate?: Float32Array;
}

export interface HatchStroke {
  tier: number;
  threshold: number;
  widthMultiplier: number;
  points: Float32Array;
}

export interface HatchResult {
  display: Float32Array;
  strokes: HatchStroke[];
}

export interface HatchContext {
  width: number;
  height: number;
  tone: Float32Array;
  orientation: Float32Array;
  trust: Float32Array;
  options: HatchOptions;
}

export interface HatchExportOptions {
  width: number;
  height: number;
  supportThreshold: number;
  minimumWidthPx: number;
  minimumRunLengthPx: number;
}

export const DEFAULT_HATCH: HatchOptions = {
  levels: [0.55, 0.36, 0.2],
  spacing: [6, 13],
  width: 1,
  opacity: 0.78,
  onset: 0.14,
  taper: 0.16,
  maxLengthFrac: 0.065,
  tierFalloff: 0.78,
  crossAngles: [0, 0.55, -0.4],
  crossWobble: 0.2,
  seed: 173,
  flatAngle: -Math.PI / 4,
};

interface Point {
  x: number;
  y: number;
}

function support(
  context: HatchContext,
  x: number,
  y: number,
  threshold: number,
): number {
  const { width, height, tone, options } = context;

  const luminance = clamp(
    sampleBilinear(tone, width, height, x, y),
    0,
    1,
  );

  const gate = options.gate
    ? clamp(
        sampleBilinear(
          options.gate,
          width,
          height,
          x,
          y,
        ),
        0,
        1,
      )
    : 1;

  return (
    smoothstep(0, options.onset, threshold - luminance) *
    gate
  );
}

/**
 * Approximate antialiased capsule coverage.
 * MAX inside a stroke prevents repeated alpha at segment joins.
 */
function stampSegment(
  buffer: Float32Array,
  width: number,
  height: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
  touched?: number[],
): void {
  const pad = radius + 0.5;

  const x0 = Math.max(
    0,
    Math.floor(Math.min(ax, bx) - pad),
  );
  const x1 = Math.min(
    width - 1,
    Math.ceil(Math.max(ax, bx) + pad),
  );
  const y0 = Math.max(
    0,
    Math.floor(Math.min(ay, by) - pad),
  );
  const y1 = Math.min(
    height - 1,
    Math.ceil(Math.max(ay, by) + pad),
  );

  const vx = bx - ax;
  const vy = by - ay;
  const lengthSquared = vx * vx + vy * vy;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = lengthSquared > 1e-10
        ? clamp(
            ((x - ax) * vx + (y - ay) * vy) /
            lengthSquared,
            0,
            1,
          )
        : 0;

      const distance = Math.hypot(
        ax + t * vx - x,
        ay + t * vy - y,
      );

      const coverage = clamp(
        Math.min(radius + 0.5 - distance, 2 * radius),
        0,
        1,
      );

      if (coverage <= 0) continue;

      const index = y * width + x;

      if (touched && buffer[index] === 0) {
        touched.push(index);
      }

      buffer[index] = Math.max(
        buffer[index],
        coverage,
      );
    }
  }
}

function pathLengths(points: Float32Array): Float32Array {
  const count = points.length / 2;
  const lengths = new Float32Array(count);

  for (let i = 1; i < count; i++) {
    lengths[i] =
      lengths[i - 1] +
      Math.hypot(
        points[i * 2] - points[i * 2 - 2],
        points[i * 2 + 1] - points[i * 2 - 1],
      );
  }

  return lengths;
}

export function renderHatch(
  context: HatchContext,
): HatchResult {
  const {
    width,
    height,
    tone,
    orientation,
    trust,
    options,
  } = context;

  const length = width * height;
  const scale = Math.max(width, height) / 1024;
  const step = Math.max(0.65, scale * 1.15);
  const minLength = Math.max(3, scale * 5);
  const maxSteps = Math.max(
    4,
    Math.ceil(
      Math.max(width, height) *
      options.maxLengthFrac /
      (2 * step),
    ),
  );

  const display = new Float32Array(length);
  const strokes: HatchStroke[] = [];
  const c2 = new Float32Array(length);
  const s2 = new Float32Array(length);

  for (let i = 0; i < length; i++) {
    c2[i] = Math.cos(2 * orientation[i]);
    s2[i] = Math.sin(2 * orientation[i]);
  }

  const flatC = Math.cos(2 * options.flatAngle);
  const flatS = Math.sin(2 * options.flatAngle);

  const strokeMask = new Float32Array(length);
  const touched: number[] = [];

  for (let tier = 0; tier < options.levels.length; tier++) {
    const threshold = options.levels[tier];
    const fraction = options.levels.length > 1
      ? tier / (options.levels.length - 1)
      : 0;

    const spacing = Math.max(
      2.5,
      (
        options.spacing[1] -
        (options.spacing[1] - options.spacing[0]) *
        fraction
      ) * scale,
    );

    const cellSize = Math.max(
      1,
      spacing * 0.78 / Math.SQRT2,
    );

    const gridWidth = Math.ceil(width / cellSize);
    const gridHeight = Math.ceil(height / cellSize);
    const occupied = new Uint8Array(
      gridWidth * gridHeight,
    );

    function nearOccupied(x: number, y: number): boolean {
      const cx = Math.floor(x / cellSize);
      const cy = Math.floor(y / cellSize);

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = cx + dx;
          const yy = cy + dy;

          if (
            xx >= 0 &&
            yy >= 0 &&
            xx < gridWidth &&
            yy < gridHeight &&
            occupied[yy * gridWidth + xx]
          ) {
            return true;
          }
        }
      }

      return false;
    }

    function direction(
      x: number,
      y: number,
      previous?: Point,
    ): Point {
      const confidence = clamp(
        sampleBilinear(trust, width, height, x, y),
        0,
        1,
      );

      const c =
        sampleBilinear(c2, width, height, x, y) *
        confidence +
        flatC * (1 - confidence);

      const s =
        sampleBilinear(s2, width, height, x, y) *
        confidence +
        flatS * (1 - confidence);

      const period = Math.max(
        8,
        Math.max(width, height) * 0.14,
      );

      const wobble = tier === 0
        ? 0
        : options.crossWobble * (
            valueNoise(
              x / period,
              y / period,
              options.seed + tier * 31,
            ) - 0.5
          );

      const base = Math.hypot(c, s) > 1e-5
        ? 0.5 * Math.atan2(s, c)
        : options.flatAngle;

      const angle =
        base +
        (
          options.crossAngles[tier] ??
          options.crossAngles[
            tier % options.crossAngles.length
          ] ??
          0
        ) +
        wobble;

      let dx = Math.cos(angle);
      let dy = Math.sin(angle);

      if (
        previous &&
        dx * previous.x + dy * previous.y < 0
      ) {
        dx = -dx;
        dy = -dy;
      }

      return { x: dx, y: dy };
    }

    function trace(
      origin: Point,
      sign: number,
    ): Point[] {
      const points: Point[] = [];
      let current = origin;

      const first = direction(origin.x, origin.y);
      let previous = {
        x: first.x * sign,
        y: first.y * sign,
      };

      const limit = tier === 0
        ? maxSteps
        : Math.max(4, Math.round(maxSteps * 0.7));

      for (let k = 0; k < limit; k++) {
        const d0 = direction(
          current.x,
          current.y,
          previous,
        );

        const midpoint = {
          x: current.x + d0.x * step / 2,
          y: current.y + d0.y * step / 2,
        };

        const d1 = direction(
          midpoint.x,
          midpoint.y,
          d0,
        );

        const next = {
          x: current.x + d1.x * step,
          y: current.y + d1.y * step,
        };

        if (
          next.x < 1 ||
          next.y < 1 ||
          next.x >= width - 1 ||
          next.y >= height - 1 ||
          support(context, next.x, next.y, threshold) < 0.015 ||
          nearOccupied(next.x, next.y) ||
          d1.x * previous.x + d1.y * previous.y < 0.65
        ) {
          break;
        }

        let loops = false;

        for (let j = 0; j < points.length - 10; j += 4) {
          if (
            Math.hypot(
              next.x - points[j].x,
              next.y - points[j].y,
            ) < step * 1.5
          ) {
            loops = true;
            break;
          }
        }

        if (loops) break;

        points.push(next);
        current = next;
        previous = d1;
      }

      return points;
    }

    const seedStep = Math.max(2, spacing * 0.7);

    for (
      let sy = 0;
      sy < Math.ceil(height / seedStep);
      sy++
    ) {
      for (
        let sx = 0;
        sx < Math.ceil(width / seedStep);
        sx++
      ) {
        const x = (
          sx + 0.2 +
          0.6 * hash01(
            sx,
            sy,
            options.seed + tier * 17,
          )
        ) * seedStep;

        const y = (
          sy + 0.2 +
          0.6 * hash01(
            sx,
            sy,
            options.seed + tier * 29 + 7,
          )
        ) * seedStep;

        if (
          x >= width - 1 ||
          y >= height - 1 ||
          nearOccupied(x, y) ||
          support(context, x, y, threshold) < 0.03
        ) {
          continue;
        }

        if (
          tier > 0 &&
          hash01(sx, sy, options.seed + tier * 41) <
          clamp(tier * 0.12, 0, 0.9)
        ) {
          continue;
        }

        const origin = { x, y };

        const points = [
          ...trace(origin, -1).reverse(),
          origin,
          ...trace(origin, 1),
        ];

        const packed = new Float32Array(points.length * 2);

        points.forEach((point, index) => {
          packed[index * 2] = point.x;
          packed[index * 2 + 1] = point.y;
        });

        const lengths = pathLengths(packed);
        const total = lengths[lengths.length - 1];

        if (total < minLength) continue;

        const widthMultiplier =
          0.92 +
          0.16 * hash01(
            sx,
            sy,
            options.seed + tier * 53,
          );

        const fade = Math.max(
          step,
          total * options.taper,
        );

        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1];
          const b = points[i];

          const along =
            (lengths[i - 1] + lengths[i]) / 2;

          const taper = smoothstep(
            0,
            fade,
            Math.min(along, total - along),
          );

          const midpointTone = sampleBilinear(
            tone,
            width,
            height,
            (a.x + b.x) / 2,
            (a.y + b.y) / 2,
          );

          const darkness = clamp(
            (threshold - midpointTone) /
            Math.max(threshold, 1e-3),
            0,
            1,
          );

          const strokeWidth =
            options.width *
            scale *
            widthMultiplier *
            (0.65 + 0.35 * darkness) *
            taper;

          if (strokeWidth <= 0.01) continue;

          stampSegment(
            strokeMask,
            width,
            height,
            a.x,
            a.y,
            b.x,
            b.y,
            strokeWidth / 2,
            touched,
          );
        }

        const alpha =
          options.opacity *
          Math.pow(options.tierFalloff, tier);

        for (const index of touched) {
          const coverage = strokeMask[index];
          strokeMask[index] = 0;

          const localSupport = support(
            context,
            index % width,
            Math.floor(index / width),
            threshold,
          );

          display[index] =
            1 -
            (1 - display[index]) *
            (1 - coverage * alpha * localSupport);
        }

        touched.length = 0;

        strokes.push({
          tier,
          threshold,
          widthMultiplier,
          points: packed,
        });

        for (const point of points) {
          const cx = clamp(
            Math.floor(point.x / cellSize),
            0,
            gridWidth - 1,
          );

          const cy = clamp(
            Math.floor(point.y / cellSize),
            0,
            gridHeight - 1,
          );

          occupied[cy * gridWidth + cx] = 1;
        }
      }
    }
  }

  return { display, strokes };
}

/**
 * Candidate export:
 * - samples eligibility along retained geometry;
 * - splits unsupported portions;
 * - rejects short runs;
 * - rasterizes each retained run at output dimensions.
 *
 * Sampling is approximate, not exact mask-boundary clipping.
 */
export function rasterizeHatchExport(
  context: HatchContext,
  strokes: HatchStroke[],
  options: HatchExportOptions,
): Uint8ClampedArray {
  validateSize(options.width, options.height);

  const sx = options.width / context.width;
  const sy = options.height / context.height;

  if (Math.abs(sx / sy - 1) > 0.01) {
    throw new Error(
      "Export aspect ratio differs from analysis by more than 1%",
    );
  }

  if (
    !Number.isFinite(options.minimumWidthPx) ||
    options.minimumWidthPx <= 0 ||
    !Number.isFinite(options.minimumRunLengthPx) ||
    options.minimumRunLengthPx < 0
  ) {
    throw new Error("Invalid hatch export parameters");
  }

  const output = new Uint8ClampedArray(
    options.width * options.height,
  );

  const coverage = new Float32Array(output.length);
  const outputScale = Math.sqrt(sx * sy);

  for (const stroke of strokes) {
    let run: Point[] = [];

    function flush(): void {
      if (run.length < 2) {
        run = [];
        return;
      }

      let runLength = 0;

      for (let i = 1; i < run.length; i++) {
        runLength += Math.hypot(
          (run[i].x - run[i - 1].x) * sx,
          (run[i].y - run[i - 1].y) * sy,
        );
      }

      if (runLength >= options.minimumRunLengthPx) {
        const designWidth =
          context.options.width *
          Math.max(context.width, context.height) / 1024 *
          stroke.widthMultiplier *
          outputScale;

        const width = Math.max(
          options.minimumWidthPx,
          designWidth,
        );

        for (let i = 1; i < run.length; i++) {
          const a = run[i - 1];
          const b = run[i];

          stampSegment(
            coverage,
            options.width,
            options.height,
            (a.x + 0.5) * sx - 0.5,
            (a.y + 0.5) * sy - 0.5,
            (b.x + 0.5) * sx - 0.5,
            (b.y + 0.5) * sy - 0.5,
            width / 2,
          );
        }
      }

      run = [];
    }

    for (let i = 2; i < stroke.points.length; i += 2) {
      const ax = stroke.points[i - 2];
      const ay = stroke.points[i - 1];
      const bx = stroke.points[i];
      const by = stroke.points[i + 1];

      const count = Math.max(
        1,
        Math.ceil(
          Math.hypot(bx - ax, by - ay) / 0.5,
        ),
      );

      for (let j = 0; j <= count; j++) {
        const t = j / count;
        const point = {
          x: ax + (bx - ax) * t,
          y: ay + (by - ay) * t,
        };

        if (
          support(
            context,
            point.x,
            point.y,
            stroke.threshold,
          ) >= options.supportThreshold
        ) {
          run.push(point);
        } else {
          flush();
        }
      }
    }

    flush();
  }

  for (let i = 0; i < output.length; i++) {
    output[i] = coverage[i] >= 0.5 ? 255 : 0;
  }

  return output;
}
