// src/lib/save-file.ts
/**
 * Saving a generated file to the device. Used by the stencil downloads in create.tsx.
 *
 * Why not just `a.click()` on a detached link: some mobile browsers (iOS Safari in particular) ignore a click on a link that is
 * not in the page, so the download silently does nothing. The link is attached before the click and removed after. The object URL is
 * kept alive for 30 seconds so a large file is not cut off while the browser is still reading it.
 */
export interface SaveEnv {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  createAnchor: () => HTMLAnchorElement;
  body: { appendChild: (n: Node) => unknown };
  setTimeout: (fn: () => void, ms: number) => unknown;
}

export const REVOKE_DELAY_MS = 30_000;

const browserEnv = (): SaveEnv => ({
  createObjectURL: (b) => URL.createObjectURL(b),
  revokeObjectURL: (u) => URL.revokeObjectURL(u),
  createAnchor: () => document.createElement("a"),
  body: document.body,
  setTimeout: (fn, ms) => setTimeout(fn, ms),
});

/** Triggers a download of `blob` as `filename`. Throws a clear error when there is nothing to save. */
export function saveBlob(blob: Blob | null | undefined, filename: string, env: SaveEnv = browserEnv()): void {
  if (!blob || blob.size === 0) throw new Error("Nothing to save: the file came out empty. Try a smaller export size.");
  const url = env.createObjectURL(blob);
  const a = env.createAnchor();
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  env.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    env.setTimeout(() => env.revokeObjectURL(url), REVOKE_DELAY_MS);
  }
}

/** canvas.toBlob as a promise that rejects with a useful message instead of resolving null (iOS returns null for oversize canvases). */
export function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not create the image. The export size may be too large for this device; try a smaller size."))), type);
    } catch (e) {
      reject(e instanceof Error ? e : new Error("Could not create the image."));
    }
  });
}
