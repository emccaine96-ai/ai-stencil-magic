import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const buildDir = "/tmp/brush-build";

console.log("=== Step 1: Compiling brush-ops with tsc ===");
fs.mkdirSync(buildDir, { recursive: true });

try {
  execSync(
    `npx tsc src/lib/vault-ops/brush-ops.ts --outDir ${buildDir} --target ES2022 --module ESNext --moduleResolution Bundler --skipLibCheck --declaration false`,
    { cwd: rootDir, stdio: "inherit" }
  );
  console.log("Compilation to /tmp/brush-build succeeded!");
} catch (err) {
  console.error("tsc compilation failed:", err);
  process.exit(1);
}

console.log("=== Step 2: Patching relative import suffixes with sed / node ===");
function patchImports(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      patchImports(fullPath);
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      let content = fs.readFileSync(fullPath, "utf-8");
      content = content.replace(/from\s+["'](\.\/|\.\.\/)([^"']+)["']/g, (match, prefix, importPath) => {
        if (!importPath.endsWith(".js")) {
          return `from "${prefix}${importPath}.js"`;
        }
        return match;
      });
      fs.writeFileSync(fullPath, content, "utf-8");
    }
  }
}
patchImports(buildDir);

console.log("=== Step 3: Polyfilling ImageData & importing compiled module ===");
if (typeof globalThis.ImageData === "undefined") {
  globalThis.ImageData = class ImageData {
    data;
    width;
    height;
    colorSpace = "srgb";
    constructor(data, width, height) {
      if (data instanceof Uint8ClampedArray) {
        this.data = data;
        this.width = width;
        this.height = height ?? data.length / (4 * width);
      } else if (typeof data === "number") {
        this.width = data;
        this.height = width;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      }
    }
  };
}

let compiledPath = path.join(buildDir, "src/lib/vault-ops/brush-ops.js");
if (!fs.existsSync(compiledPath)) {
  compiledPath = path.join(buildDir, "vault-ops/brush-ops.js");
}

const brushOps = await import(`file://${compiledPath}`);

const {
  smudgeImageData,
  liquifyImageData,
  healImageData,
  cloneStampImageData,
  removeBackground,
  removeBackgroundModel,
  upscaleImageData,
  createEmptyImageData,
  cloneImageData,
} = brushOps;

console.log("=== Step 4: Running Verification Asserts ===");

let allPassed = true;
function assert(condition, message) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
  } else {
    console.error(`❌ [FAIL] ${message}`);
    allPassed = false;
  }
}

function createGradientImage(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      data[idx] = Math.round((x / width) * 255); // R
      data[idx + 1] = Math.round((y / height) * 255); // G
      data[idx + 2] = Math.round(((x + y) / (width + height)) * 255); // B
      data[idx + 3] = 255; // A
    }
  }
  return new ImageData(data, width, height);
}

function createCheckeredImage(width, height) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const check = ((x >> 4) ^ (y >> 4)) & 1;
      const val = check ? 200 : 50;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }
  return new ImageData(data, width, height);
}

function checkImageDataValid(img, expectedW, expectedH, name) {
  assert(img.width === expectedW, `${name}: width matches ${expectedW} (got ${img.width})`);
  assert(img.height === expectedH, `${name}: height matches ${expectedH} (got ${img.height})`);

  let hasNaN = false;
  let outOfRange = false;
  for (let i = 0; i < img.data.length; i++) {
    const v = img.data[i];
    if (Number.isNaN(v)) hasNaN = true;
    if (v < 0 || v > 255) outOfRange = true;
  }
  assert(!hasNaN, `${name}: no NaN values`);
  assert(!outOfRange, `${name}: all values in [0, 255] range`);
}

function isIdentical(imgA, imgB) {
  if (imgA.width !== imgB.width || imgA.height !== imgB.height) return false;
  if (imgA.data.length !== imgB.data.length) return false;
  for (let i = 0; i < imgA.data.length; i++) {
    if (imgA.data[i] !== imgB.data[i]) return false;
  }
  return true;
}

// -------------------------------------------------------------
// Test 1: Smudge with zero-length stroke == identity
// -------------------------------------------------------------
console.log("\n--- Test 1: Smudge ---");
const testImg = createCheckeredImage(256, 256);
const smudgeZero = smudgeImageData(testImg, [{ x: 100, y: 100 }], { radius: 20, strength: 0.5 });
assert(isIdentical(testImg, smudgeZero), "Smudge with single-point stroke returns identity");

const smudgeActive = smudgeImageData(
  testImg,
  [
    { x: 50, y: 50, pressure: 1.0 },
    { x: 150, y: 150, pressure: 1.0 },
  ],
  { radius: 20, strength: 0.8 }
);
checkImageDataValid(smudgeActive, 256, 256, "Smudge active stroke");
assert(!isIdentical(testImg, smudgeActive), "Smudge active stroke mutates image as expected");

// -------------------------------------------------------------
// Test 2: Liquify with zero strength == identity
// -------------------------------------------------------------
console.log("\n--- Test 2: Liquify ---");
const liquifyZero = liquifyImageData(testImg, [{ x: 128, y: 128 }], { mode: "push", radius: 30, strength: 0 });
assert(isIdentical(testImg, liquifyZero), "Liquify with zero strength returns identity");

const liquifyPush = liquifyImageData(
  testImg,
  [
    { x: 100, y: 128 },
    { x: 150, y: 128 },
  ],
  { mode: "push", radius: 40, strength: 0.8 }
);
checkImageDataValid(liquifyPush, 256, 256, "Liquify push mode");

const liquifyBloat = liquifyImageData(testImg, [{ x: 128, y: 128 }], { mode: "bloat", radius: 40, strength: 0.8 });
checkImageDataValid(liquifyBloat, 256, 256, "Liquify bloat mode");

const liquifyPucker = liquifyImageData(testImg, [{ x: 128, y: 128 }], { mode: "pucker", radius: 40, strength: 0.8 });
checkImageDataValid(liquifyPucker, 256, 256, "Liquify pucker mode");

// -------------------------------------------------------------
// Test 3: Heal of an empty mask == identity & Heal on gradient
// -------------------------------------------------------------
console.log("\n--- Test 3: Spot Heal ---");
const healEmpty = healImageData(testImg, { mask: new Uint8Array(256 * 256) });
assert(isIdentical(testImg, healEmpty), "Heal of empty mask returns identity");

// Masked Gradient Test
const trueGradient = createGradientImage(256, 256);
const maskedGradientData = new Uint8ClampedArray(trueGradient.data);
const maskArray = new Uint8Array(256 * 256);

// Cut out a circular hole at center (128, 128)
const cx = 128, cy = 128, radius = 25;
let holePixelCount = 0;

for (let y = 0; y < 256; y++) {
  for (let x = 0; x < 256; x++) {
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy <= radius * radius) {
      const idx = (y * 256 + x) * 4;
      maskedGradientData[idx] = 0;     // R
      maskedGradientData[idx + 1] = 0; // G
      maskedGradientData[idx + 2] = 0; // B
      maskArray[y * 256 + x] = 1;
      holePixelCount++;
    }
  }
}

const maskedGradientImg = new ImageData(maskedGradientData, 256, 256);

// Calculate MSE of masked input vs true gradient inside hole
let maskedErrSum = 0;
for (let y = 0; y < 256; y++) {
  for (let x = 0; x < 256; x++) {
    if (maskArray[y * 256 + x] === 1) {
      const idx = (y * 256 + x) * 4;
      const dr = maskedGradientImg.data[idx] - trueGradient.data[idx];
      const dg = maskedGradientImg.data[idx + 1] - trueGradient.data[idx + 1];
      const db = maskedGradientImg.data[idx + 2] - trueGradient.data[idx + 2];
      maskedErrSum += dr * dr + dg * dg + db * db;
    }
  }
}
const maskedMSE = maskedErrSum / (holePixelCount * 3);

// Heal the masked gradient image
const healedGradientImg = healImageData(maskedGradientImg, { mask: maskArray, iterations: 100 });
checkImageDataValid(healedGradientImg, 256, 256, "Healed gradient image");

// Calculate MSE of healed output vs true gradient inside hole
let healedErrSum = 0;
for (let y = 0; y < 256; y++) {
  for (let x = 0; x < 256; x++) {
    if (maskArray[y * 256 + x] === 1) {
      const idx = (y * 256 + x) * 4;
      const dr = healedGradientImg.data[idx] - trueGradient.data[idx];
      const dg = healedGradientImg.data[idx + 1] - trueGradient.data[idx + 1];
      const db = healedGradientImg.data[idx + 2] - trueGradient.data[idx + 2];
      healedErrSum += dr * dr + dg * dg + db * db;
    }
  }
}
const healedMSE = healedErrSum / (holePixelCount * 3);

console.log(`   --> Masked Input MSE relative to true gradient: ${maskedMSE.toFixed(4)}`);
console.log(`   --> Healed Output MSE relative to true gradient: ${healedMSE.toFixed(4)}`);
assert(
  healedMSE < maskedMSE,
  `Healed output error (${healedMSE.toFixed(4)}) is significantly lower than masked input error (${maskedMSE.toFixed(4)})`
);

// -------------------------------------------------------------
// Test 4: Clone stamp with zero offset == identity
// -------------------------------------------------------------
console.log("\n--- Test 4: Clone Stamp ---");
const cloneZero = cloneStampImageData(
  testImg,
  [
    { x: 50, y: 50 },
    { x: 100, y: 100 },
  ],
  { sourceOffset: { x: 0, y: 0 }, radius: 25, strength: 0.8 }
);
assert(isIdentical(testImg, cloneZero), "Clone stamp with zero offset returns identity");

const cloneActive = cloneStampImageData(
  testImg,
  [
    { x: 50, y: 50 },
    { x: 100, y: 100 },
  ],
  { sourceOffset: { x: 30, y: 30 }, radius: 25, strength: 0.8 }
);
checkImageDataValid(cloneActive, 256, 256, "Clone stamp active stroke");

// -------------------------------------------------------------
// Test 5: Remove Background
// -------------------------------------------------------------
console.log("\n--- Test 5: Remove Background ---");
const bgResult = await removeBackground(testImg);
checkImageDataValid(bgResult.imageData, 256, 256, "Remove background output");
assert(bgResult.mask.length === 256 * 256, "Remove background mask buffer matches image size");
console.log(`   --> Background removal method reported: '${bgResult.method}'`);

// -------------------------------------------------------------
// Test 6: Upscale
// -------------------------------------------------------------
console.log("\n--- Test 6: Upscale ---");
let progressCalled = false;
const upscaled = await upscaleImageData(testImg, 2, (p) => {
  progressCalled = true;
}, { sharpen: true, sharpenAmount: 0.3 });

checkImageDataValid(upscaled, 512, 512, "Upscaled 2x image");
assert(progressCalled, "Upscale progress callback was invoked");

console.log("\n=======================================================");
if (allPassed) {
  console.log("🎉 ALL BRUSH-OPS VERIFICATION CHECKS PASSED!");
  process.exit(0);
} else {
  console.error("💥 SOME BRUSH-OPS CHECKS FAILED!");
  process.exit(1);
}
