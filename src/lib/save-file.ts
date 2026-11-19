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

/**
 * True on a phone or tablet, including the cases a user-agent check alone misses:
 *  - an iPad (iPadOS 13+) and any iPhone/iPad using "Request Desktop Site" report themselves as a Mac, but a Mac has no touch screen;
 *  - Android Chrome with "Desktop site" ticked reports a Linux desktop.
 * Touch points are the tie-breaker: a real Mac or Linux desktop reports 0 (or 1 with some trackpads), a touch device reports 5 or more.
 */
export function isPhoneOrTablet(nav: { maxTouchPoints?: number; userAgent?: string; platform?: string } | undefined): boolean {
  if (!nav) return false;
  const touch = nav.maxTouchPoints ?? 0;
  const ua = nav.userAgent ?? "";
  if (touch > 0 && /android|iphone|ipad|ipod/i.test(ua)) return true;
  if (touch >= 2 && /macintosh|mac os x|x11|linux/i.test(ua) && !/windows/i.test(ua)) return true;
  return false;
}

/**
 * iOS Safari refuses canvases above 16,777,216 pixels (4096 x 4096): toBlob returns null or the page reloads.
 * Android Chrome and desktop browsers allow far more, so the cap only applies on a phone or tablet.
 */
export const MOBILE_CANVAS_MAX_PIXELS = 16_777_216;

/**
 * The largest export width that fits the device, for an image of the given aspect ratio (width / height).
 * Returns `requested` unchanged on a desktop, or when it already fits. Never returns less than 256.
 */
export function maxExportWidth(requested: number, aspect: number, mobile: boolean): number {
  if (!mobile || !(requested > 0)) return requested;
  const ratio = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  const height = requested / ratio;
  if (requested * height <= MOBILE_CANVAS_MAX_PIXELS) return requested;
  // width * (width / ratio) <= max  =>  width <= sqrt(max * ratio); floor a little so rounding of the height cannot push it over
  return Math.max(256, Math.floor(Math.sqrt(MOBILE_CANVAS_MAX_PIXELS * ratio) * 0.995));
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
  isTouchDevice: () => isPhoneOrTablet(typeof navigator !== "undefined" ? navigator : undefined),
  canDownloadLink: () => typeof document !== "undefined" && "download" in document.createElement("a"),
});

/** How a save ended. "shared" = the share sheet accepted the file. "cancelled" = the user closed the share sheet.
 * "downloaded" = a download link was clicked (browsers give no further confirmation). "manual" = nothing automatic works here, so show the image to press and hold. */
export type SaveResult = "shared" | "cancelled" | "downloaded" | "manual";

/**
 * Saves an image to the device, trying in order:
 *  1. the share sheet (phones: "Save Image" / "Save to Files"), when the browser can share this file;
 *  2. on a phone or tablet, if sharing is unavailable or fails: "manual" (a download link would go to Files, not Photos);
 *  3. on a desktop: a download link added to the page, clicked, with the object URL released after a short delay;
 *  4. "manual": the caller shows the image full-screen with "Press and hold the image to save".
 * Never reports success before the share promise resolves. The user closing the share sheet returns "cancelled", not an error.
 */
export async function saveImageToDevice(
  blob: Blob | null | undefined,
  filename: string,
  env: ShareEnv = browserShareEnv(),
  saveEnv?: SaveEnv,
): Promise<SaveResult> {
  if (!blob || blob.size === 0) throw new Error("Nothing to save: the file came out empty. Try a smaller export size.");
  const phone = blob.type.startsWith("image/") && env.isTouchDevice();
  if (phone) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      if (env.canShareFiles([file])) {
        await env.share({ files: [file], title: filename });
        return "shared";
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
      // any other share failure: handled below
    }
    // On a phone a download link saves to the Files app (Downloads), not the Photos gallery, and the user is told it worked.
    // The only route that reliably reaches Photos from here is the press-and-hold image, so show that instead.
    return "manual";
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
