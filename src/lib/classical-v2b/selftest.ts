import {
  distanceInside,
  sampleBilinear,
} from "./fieldops";

function assert(
  condition: boolean,
  message: string,
): void {
  if (!condition) throw new Error(message);
}

let seed = 12345;

function random(): number {
  seed = (
    Math.imul(seed, 1664525) + 1013904223
  ) >>> 0;

  return seed / 4294967296;
}

for (const [width, height] of [
  [1, 1],
  [1, 12],
  [12, 1],
  [9, 11],
  [16, 13],
]) {
  for (let trial = 0; trial < 30; trial++) {
    const mask = new Uint8Array(width * height);

    for (let i = 0; i < mask.length; i++) {
      mask[i] = random() > 0.25 ? 1 : 0;
    }

    const saved = mask.slice();
    const result = distanceInside(mask, width, height);

    const background: number[] = [];

    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) background.push(i);
    }

    for (let i = 0; i < mask.length; i++) {
      let expected = 1e4;

      for (const j of background) {
        expected = Math.min(
          expected,
          Math.hypot(
            i % width - j % width,
            Math.floor(i / width) -
            Math.floor(j / width),
          ),
        );
      }

      assert(
        Math.abs(result[i] - expected) < 1e-4,
        `EDT mismatch at ${width}×${height}, ${i}`,
      );

      assert(
        mask[i] === saved[i],
        "Distance transform mutated input",
      );
    }
  }
}

assert(
  sampleBilinear(
    new Float32Array([0, 1, 2, 3]),
    2,
    2,
    0.5,
    0.5,
  ) === 1.5,
  "Bilinear center failed",
);

console.log(
  "Starter numerical checks passed. " +
  "This does not establish visual or production readiness.",
);
