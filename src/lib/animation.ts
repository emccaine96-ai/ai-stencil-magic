// Lightweight frame-based animation built on top of the existing
// document model. Frames are JSON-serialised EditorState snapshots stored
// inside DocumentData via a sidecar field (see localDB.ts).

import type { EditorState } from "./localDB";
import { v4 as uuidv4 } from "uuid";
import { GIFEncoder, quantize, applyPalette } from "gifenc";

export type Frame = {
  id: string;
  name: string;
  thumbnail: string;
  state: string; // JSON EditorState
  duration: number; // ms
};

export type AnimationData = {
  fps: number;
  loop: boolean;
  frames: Frame[];
  activeFrameId: string | null;
};

export function newAnimation(initial?: { state: EditorState; thumbnail: string }): AnimationData {
  const f: Frame[] = initial
    ? [{ id: uuidv4(), name: "Frame 1", thumbnail: initial.thumbnail, state: JSON.stringify(initial.state), duration: 100 }]
    : [];
  return { fps: 12, loop: true, frames: f, activeFrameId: f[0]?.id ?? null };
}

export async function exportGif(frames: { canvas: HTMLCanvasElement; duration: number }[]): Promise<Blob> {
  if (!frames.length) throw new Error("No frames");
  const gif = GIFEncoder();
  for (const f of frames) {
    const { canvas, duration } = f;
    const ctx = canvas.getContext("2d")!;
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const palette = quantize(data, 256);
    const indexed = applyPalette(data, palette);
    gif.writeFrame(indexed, width, height, { palette, delay: Math.max(20, Math.round(duration)) });
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}