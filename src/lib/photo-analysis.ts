/**
 * Local pre-tuning model — on-device analysis of a selected photo, run once
 * per photo selection, before the user touches any slider. Suggests Detail
 * (intensity) and Fix Harsh Lighting (Retinex) settings based on what's
 * actually in the photo. Never silently changes anything — produces a
 * dismissible suggestion the caller shows the user, who applies or ignores
 * it. Purely additive: feeds the *existing* config surface (intensity,
 * useRetinex), does not replace or duplicate any pipeline stage, and never
 * runs inside the render pipeline itself.
 *
 * Mirrors classical-engine/region-segmenter.ts's exact pattern (lazy
 * singleton, dynamic import, try/catch graceful fallback) for consistency —
 * zero new npm dependencies, reuses @mediapipe/tasks-vision (already a repo
 * dependency) plus existing classical CV kernels (toGrayscale, sobel).
 */
// @ts-ignore — standalone JS module (matches classical-pro-integration.ts convention)
import { toGrayscale } from "./classical/grayscale.js";
import { sobel } from "./classical-engine/edges";

let faceDetectorPromise: Promise<any> | null = null;

async function getFaceDetector(): Promise<any> {
  if (!faceDetectorPromise) {
    faceDetectorPromise = (async () => {
      try {
        const { FilesetResolver, FaceDetector } = await import("@mediapipe/tasks-vision" as any);
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        return FaceDetector.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/latest/blaze_face_short_range.tflite",
          },
          runningMode: "IMAGE",
        });
      } catch (e) {
        console.warn("MediaPipe face detector not available, falling back to CV-only analysis:", e);
        return null;
      }
    })();
  }
  return faceDetectorPromise;
}

export interface PhotoAnalysis {
  faceDetected: boolean;
  faceAreaRatio: number;      // 0..1 of frame covered by the largest detected face box
  meanContrast: number;       // 0..1, normalized luminance std-dev
  edgeDensity: number;        // 0..1, fraction of pixels above an edge-magnitude cutoff
  shadowClipping: number;     // 0..1, fraction of near-black pixels
  highlightClipping: number;  // 0..1, fraction of near-white pixels
}

export interface TuningSuggestion {
  intensity: number;          // 0..1 suggested Detail slider position
  useRetinex: boolean;        // suggested Fix Harsh Lighting state
  reasoning: string[];        // shown in the UI — this is never a silent black box
}

const ANALYSIS_SIZE = 256; // matches the resolution MediaPipe's own segmenter already runs at

export async function analyzePhoto(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap
): Promise<PhotoAnalysis> {
  // Downscale once for speed — this must be near-instant, it runs before
  // the user even opens the settings panel.
  const canvas = document.createElement("canvas");
  canvas.width = ANALYSIS_SIZE;
  canvas.height = ANALYSIS_SIZE;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(source as any, 0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);
  const imgData = ctx.getImageData(0, 0, ANALYSIS_SIZE, ANALYSIS_SIZE);

  // --- Classical CV metrics (reuses existing kernels, no new math) ---
  // toGrayscale mutates+returns the same ImageData (existing convention in
  // this repo — see classical/grayscale.js) — imgData isn't reused after
  // this, so the in-place mutation is safe here.
  const gray = toGrayscale(imgData);
  const grayF = new Float32Array(ANALYSIS_SIZE * ANALYSIS_SIZE);
  for (let i = 0, p = 0; i < gray.data.length; i += 4, p++) grayF[p] = gray.data[i];

  let sum = 0, sumSq = 0, shadow = 0, highlight = 0;
  const n = grayF.length;
  for (let i = 0; i < n; i++) {
    const v = grayF[i];
    sum += v; sumSq += v * v;
    if (v < 20) shadow++;
    if (v > 235) highlight++;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const meanContrast = Math.min(1, Math.sqrt(Math.max(0, variance)) / 80); // normalize, empirical divisor — tune against real photos

  const edges = sobel(grayF, ANALYSIS_SIZE, ANALYSIS_SIZE); // reuse existing edges.ts export
  let edgeCount = 0;
  for (let i = 0; i < edges.magnitude.length; i++) if (edges.magnitude[i] > 40) edgeCount++;
  const edgeDensity = edgeCount / n;

  // --- Face signal (graceful no-op if MediaPipe unavailable) ---
  let faceDetected = false, faceAreaRatio = 0;
  try {
    const detector = await getFaceDetector();
    if (detector) {
      const result = detector.detect(canvas);
      if (result?.detections?.length) {
        const box = result.detections[0].boundingBox;
        faceDetected = true;
        faceAreaRatio = Math.min(1, (box.width * box.height) / (ANALYSIS_SIZE * ANALYSIS_SIZE));
      }
    }
  } catch (e) {
    console.warn("Face detection failed, continuing without it:", e);
  }

  return {
    faceDetected,
    faceAreaRatio,
    meanContrast,
    edgeDensity,
    shadowClipping: shadow / n,
    highlightClipping: highlight / n,
  };
}

// Rule-based, transparent, easy to re-tune without touching model weights.
// Starting-point thresholds — verify against real photos before treating as
// final (see verification notes in the implementation guide this was built
// from). This only ever produces intensity/useRetinex — never backgroundMode,
// inkColor, or style, since those are creative choices, not photo-quality
// corrections.
export function suggestTuning(a: PhotoAnalysis): TuningSuggestion {
  const reasoning: string[] = [];

  const clipping = a.shadowClipping + a.highlightClipping;
  const useRetinex = clipping > 0.18 || a.meanContrast < 0.12;
  if (useRetinex) {
    reasoning.push(
      clipping > 0.18
        ? "Photo has significant blown-out or crushed areas — lighting correction may help."
        : "Photo is low-contrast overall — lighting correction may help."
    );
  }

  let intensity = 0.5;
  if (a.edgeDensity > 0.35) {
    intensity = 0.38;
    reasoning.push("Photo is very detailed/busy (hair, texture) — a lower detail setting avoids over-inking.");
  } else if (a.edgeDensity < 0.12) {
    intensity = 0.65;
    reasoning.push("Photo is quite smooth/simple — a higher detail setting captures more linework.");
  }

  return { intensity, useRetinex, reasoning };
}
