if (typeof (globalThis as any).ImageData === "undefined") {
  (globalThis as any).ImageData = class {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    constructor(data: Uint8ClampedArray, width: number, height?: number) {
      this.data = data;
      this.width = width;
      this.height = height ?? data.length / (4 * width);
    }
  };
}

import { applyFlowPortraitEngine, DEFAULT_FLOW_PORTRAIT_OPTIONS } from "../src/lib/stencil-engine";

function makeBandedImage(width: number, height: number, bands: number[]): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  const bandHeight = height / bands.length;
  for (let y = 0; y < height; y++) {
    const bandIdx = Math.min(bands.length - 1, Math.floor(y / bandHeight));
    const v = bands[bandIdx];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

function makeDiagonalStripes(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = Math.sin((x + y) * 0.3) > 0 ? 40 : 220;
      const i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

function inkDensity(img: ImageData, yStart: number, yEnd: number): number {
  let ink = 0;
  let total = 0;
  for (let y = yStart; y < yEnd; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] > 0 && img.data[i] < 128) ink++;
      total++;
    }
  }
  return total > 0 ? ink / total : 0;
}

async function main() {
  let pass = true;
  const log = (ok: boolean, msg: string) => {
    console.log(`${ok ? "PASS" : "FAIL"} - ${msg}`);
    if (!ok) pass = false;
  };

  const bandImg = makeBandedImage(200, 250, [245, 190, 145, 95, 40]);
  const t0 = Date.now();
  const bandOut = await applyFlowPortraitEngine(bandImg, DEFAULT_FLOW_PORTRAIT_OPTIONS);
  const elapsedBand = Date.now() - t0;
  const bandHeight = 50;
  const densities: number[] = [];
  for (let b = 0; b < 5; b++) {
    densities.push(inkDensity(bandOut, b * bandHeight, (b + 1) * bandHeight));
  }
  console.log("Ink density per band (light->dark):", densities.map((d) => d.toFixed(3)).join(", "));
  let monotonic = true;
  for (let i = 1; i < densities.length; i++) {
    if (densities[i] < densities[i - 1] - 0.02) monotonic = false;
  }
  log(monotonic, "ink density increases monotonically from light to dark bands");
  log(densities[0] < 0.05, "lightest band (245) stays near-empty");
  log(densities[4] > densities[0] + 0.15, "darkest band (40) is meaningfully denser than lightest");

  let hasNaN = false;
  for (let i = 0; i < bandOut.data.length; i++) {
    if (Number.isNaN(bandOut.data[i])) { hasNaN = true; break; }
  }
  log(!hasNaN, "output buffer contains no NaN values");
  log(bandOut.width === bandImg.width && bandOut.height === bandImg.height, "output dimensions match input");
  log(elapsedBand < 5000, `banded-image run completed in ${elapsedBand}ms (< 5000ms budget)`);

  const stripeImg = makeDiagonalStripes(200, 200);
  const t1 = Date.now();
  const stripeOut = await applyFlowPortraitEngine(stripeImg, DEFAULT_FLOW_PORTRAIT_OPTIONS);
  const elapsedStripe = Date.now() - t1;
  let stripeInk = 0;
  for (let i = 3; i < stripeOut.data.length; i += 4) if (stripeOut.data[i] > 0) stripeInk++;
  const stripeCoverage = stripeInk / (stripeOut.width * stripeOut.height);
  console.log(`Diagonal-stripe ink coverage: ${(stripeCoverage * 100).toFixed(1)}%`);
  log(stripeCoverage > 0.05 && stripeCoverage < 0.95, "diagonal-stripe test produces non-degenerate output (not blank, not solid black)");
  log(elapsedStripe < 5000, `stripe-image run completed in ${elapsedStripe}ms (< 5000ms budget)`);

  console.log(pass ? "\nALL CHECKS PASSED" : "\nSOME CHECKS FAILED - see above");
  process.exit(pass ? 0 : 1);
}

main();
