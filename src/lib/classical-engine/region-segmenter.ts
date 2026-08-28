/**
 * Module 7 — Region-aware processing (MediaPipe multiclass segmentation).
 * Separates hair, face-skin, body-skin, clothes, background so each region
 * can get different detail/simplification treatment.
 *
 * NOTE: The app already uses @imgly/background-removal. This module adds
 * MediaPipe's selfie_multiclass_256x256 model for finer region separation.
 * If MediaPipe is not available at runtime, it falls back gracefully.
 */

export const REGION = {
  BACKGROUND: 0, HAIR: 1, BODY_SKIN: 2, FACE_SKIN: 3, CLOTHES: 4, OTHER: 5,
} as const;

let segmenterPromise: Promise<any> | null = null;

export async function getRegionSegmenter(): Promise<any> {
  if (!segmenterPromise) {
    segmenterPromise = (async () => {
      try {
        const { FilesetResolver, ImageSegmenter } = await import('@mediapipe/tasks-vision' as any);
        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
        );
        return ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite',
          },
          outputCategoryMask: true,
          outputConfidenceMasks: false,
          runningMode: 'IMAGE',
        });
      } catch (e) {
        console.warn('MediaPipe multiclass segmenter not available, region processing disabled:', e);
        return null;
      }
    })();
  }
  return segmenterPromise;
}

export async function segmentRegions(bitmap: ImageBitmap | HTMLCanvasElement): Promise<Uint8Array | null> {
  const segmenter = await getRegionSegmenter();
  if (!segmenter) return null;
  try {
    const result = segmenter.segment(bitmap);
    if (!result.categoryMask) return null;
    return result.categoryMask.getAsUint8Array();
  } catch (e) {
    console.warn('Region segmentation failed:', e);
    return null;
  }
}
