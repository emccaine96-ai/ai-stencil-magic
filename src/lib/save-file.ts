// src/lib/save-file.ts
/**
 * Saving a generated file to the device. Used by the stencil downloads in create.tsx.
 *
 * Why not just `a.click()` on a detached link: some mobile browsers (iOS Safari in particular) ignore a click on a link that is
 * not in the page, so the download silently does nothing. The link is attached before the click and removed after. The object URL is
 * kept alive for 2 seconds (not revoked immediately) so the browser can start reading the file first.
 */
export interface SaveEnv {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  createAnchor: () => HTMLAnchorElement;
  body: { appendChild: (n: Node) => unknown };
  setTimeout: (fn: () => void, ms: number) => unknown;
}

export const REVOKE_DELAY_MS = 2_000;

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

/** Decode a data: URL ('data:<mime>;base64,<payload>' or the percent-encoded form) into a Blob. Throws a clear error on malformed input or an empty result. Used so large files are downloaded from a Blob instead of a data: URL link. */
export function dataUrlToBlob(dataUrl: string): Blob {
  const bad = () => new Error("That file could not be read for download.");
  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:")) throw bad();
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw bad();
  const parts = dataUrl.slice(5, comma).split(";");
  const mime = parts[0] || "application/octet-stream";
  const isBase64 = parts.slice(1).some((p) => p.trim().toLowerCase() === "base64");
  const payload = dataUrl.slice(comma + 1);
  let bytes: Uint8Array<ArrayBuffer>;
  try {
    if (isBase64) {
      const bin = atob(payload);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new Uint8Array(new TextEncoder().encode(decodeURIComponent(payload)));
    }
  } catch {
    throw bad();
  }
  if (bytes.length === 0) throw new Error("Nothing to save: the file came out empty.");
  return new Blob([bytes], { type: mime });
}

/** File extension that matches a blob's real type, so a JPEG thumbnail is not saved as .png. */
export function extensionForBlob(blob: Blob): string {
  if (blob.type === "image/jpeg") return "jpg";
  if (blob.type === "image/webp") return "webp";
  if (blob.type === "image/svg+xml") return "svg";
  return "png";
}

export interface ShareEnv {
  canShareFiles: (files: File[]) => boolean;
  share: (data: { files: File[]; title?: string }) => Promise<void>;
  isTouchDevice: () => boolean;
  /** True when a link with a download attribute can work in this browser. */
  canDownloadLink: () => boolean;
}

const browserShareEnv = (): ShareEnv => ({
  canShareFiles: (files) => typeof navigator !== "undefined" && typeof navigator.canShare === "function" && typeof navigator.share === "function" && navigator.canShare({ files }),
  share: (data) => navigator.share(data),
  isTouchDevice: () => typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0 && /android|iphone|ipad|ipod/i.test(navigator.userAgent),
  canDownloadLink: () => typeof document !== "undefined" && "download" in document.createElement("a"),
});

/** How a save ended. "shared" = the share sheet accepted the file. "cancelled" = the user closed the share sheet.
 * "downloaded" = a download link was clicked (browsers give no further confirmation). "manual" = nothing automatic works here, so show the image to press and hold. */
export type SaveResult = "shared" | "cancelled" | "downloaded" | "manual";

/**
 * Saves an image to the device, trying in order:
 *  1. the share sheet (phones: "Save Image" / "Save to Files"), when the browser can share this file;
 *  2. a download link added to the page, clicked, with the object URL released after a short delay;
 *  3. "manual": the caller shows the image full-screen with "Press and hold the image to save".
 * Never reports success before the share promise resolves. The user closing the share sheet returns "cancelled", not an error.
 */
export async function saveImageToDevice(
  blob: Blob | null | undefined,
  filename: string,
  env: ShareEnv = browserShareEnv(),
  saveEnv?: SaveEnv,
): Promise<SaveResult> {
  if (!blob || blob.size === 0) throw new Error("Nothing to save: the file came out empty. Try a smaller export size.");
  if (blob.type.startsWith("image/") && env.isTouchDevice()) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      if (env.canShareFiles([file])) {
        await env.share({ files: [file], title: filename });
        return "shared";
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
      // any other share failure: fall through to the download link
    }
  }
  if (!env.canDownloadLink()) return "manual";
  try {
    saveBlob(blob, filename, saveEnv);
  } catch {
    return "manual";
  }
  return "downloaded";
}

/** Loads an image from a data: or blob: URL (or a remote one, requested as anonymous CORS) so drawing it never taints the canvas. */
export function loadImageForExport(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith("data:") && !src.startsWith("blob:")) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The stencil image could not be loaded for export."));
    img.src = src;
  });
}
