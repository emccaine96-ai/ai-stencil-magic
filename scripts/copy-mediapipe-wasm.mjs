// Copies the MediaPipe WASM runtime from node_modules into public/mediapipe/wasm so it is served
// from OUR origin (pinned to the installed package version) instead of an unpinned CDN `@latest`.
// Runs automatically before dev and build. Output is git-ignored.
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const to = join(root, "public", "mediapipe", "wasm");

if (!existsSync(from)) {
  console.error(`[mediapipe] ${from} not found. Run npm install first.`);
  process.exit(1);
}
mkdirSync(to, { recursive: true });
cpSync(from, to, { recursive: true });
console.log("[mediapipe] wasm copied to public/mediapipe/wasm");
