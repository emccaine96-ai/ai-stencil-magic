/**
 * Shared helpers for building and persisting VaultProcreateEditor state.
 * Keeps manual Save, autosave, and "Save now" on one correct path.
 */

import type { EditorState, LayerState } from "@/lib/localDB";

export type BuildEditorStateOpts = {
  refLoaded: boolean;
  refVisible: boolean;
  refOpacity: number;
};

/**
 * Snapshot the live canvases into an EditorState suitable for IndexedDB.
 * Layer 0 = Reference (optional), Layer 1 = Stencil (always).
 */
export function buildEditorState(
  canvas: HTMLCanvasElement,
  refCanvas: HTMLCanvasElement | null,
  opts: BuildEditorStateOpts,
): EditorState {
  const stencilUrl = canvas.toDataURL("image/png");
  const refUrl =
    opts.refLoaded && refCanvas ? refCanvas.toDataURL("image/png") : "";

  const layers: LayerState[] = [];

  if (refUrl) {
    layers.push({
      id: "reference",
      name: "Reference",
      visible: opts.refVisible,
      locked: true,
      alphaLock: false,
      clipping: false,
      opacity: opts.refOpacity,
      blendMode: "normal",
      dataUrl: refUrl,
    });
  }

  layers.push({
    id: "stencil",
    name: "Stencil",
    visible: true,
    locked: false,
    alphaLock: false,
    clipping: false,
    opacity: 1,
    blendMode: "normal",
    dataUrl: stencilUrl,
  });

  return {
    width: canvas.width,
    height: canvas.height,
    activeLayerId: "stencil",
    layers,
  };
}

/** JPEG thumbnail ~384px wide for library cards. */
export function makeEditorThumbnail(
  canvas: HTMLCanvasElement,
  maxWidth = 384,
  quality = 0.72,
): string {
  const tc = document.createElement("canvas");
  const ratio = canvas.height / Math.max(1, canvas.width);
  tc.width = maxWidth;
  tc.height = Math.max(1, Math.round(maxWidth * ratio));
  const tctx = tc.getContext("2d")!;
  tctx.fillStyle = "#ffffff";
  tctx.fillRect(0, 0, tc.width, tc.height);
  tctx.drawImage(canvas, 0, 0, tc.width, tc.height);
  return tc.toDataURL("image/jpeg", quality);
}
