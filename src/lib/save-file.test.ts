import { expect, test } from "bun:test";
import { saveBlob, canvasToBlob, dataUrlToBlob, extensionForBlob, REVOKE_DELAY_MS, type SaveEnv } from "./save-file";

function fakeEnv() {
  const log: string[] = [];
  let attached = false;
  const anchor = { href: "", download: "", rel: "", style: { display: "" }, click() { log.push(attached ? "click-attached" : "click-DETACHED"); }, remove() { attached = false; log.push("removed"); } } as unknown as HTMLAnchorElement;
  const timers: Array<{ ms: number; fn: () => void }> = [];
  const env: SaveEnv = {
    createObjectURL: () => { log.push("create-url"); return "blob:fake"; },
    revokeObjectURL: (u) => log.push(`revoke ${u}`),
    createAnchor: () => anchor,
    body: { appendChild: () => { attached = true; log.push("appended"); } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return 1; },
  };
  return { env, log, anchor, timers };
}
const blob = (n = 4) => new Blob([new Uint8Array(n)], { type: "image/png" });

test("the link is attached to the page BEFORE the click (what iOS Safari needs)", () => {
  const { env, log } = fakeEnv();
  saveBlob(blob(), "stencil.png", env);
  expect(log).toEqual(["create-url", "appended", "click-attached", "removed"]);
});

test("filename and url are set on the link", () => {
  const { env, anchor } = fakeEnv();
  saveBlob(blob(), "stencil-2048px.png", env);
  expect(anchor.download).toBe("stencil-2048px.png");
  expect(anchor.href).toBe("blob:fake");
});

test("the object URL is revoked only after a 1-2 second delay, not immediately", () => {
  const { env, log, timers } = fakeEnv();
  saveBlob(blob(), "a.png", env);
  expect(timers).toHaveLength(1);
  expect(timers[0].ms).toBe(REVOKE_DELAY_MS);
  expect(REVOKE_DELAY_MS).toBeGreaterThanOrEqual(1_000);
  expect(REVOKE_DELAY_MS).toBeLessThanOrEqual(2_000);
  expect(log).not.toContain("revoke blob:fake");
  timers[0].fn();
  expect(log).toContain("revoke blob:fake");
});

test("a null, undefined or empty blob is a clear error and nothing is created", () => {
  for (const b of [null, undefined, new Blob([])]) {
    const { env, log } = fakeEnv();
    let msg = ""; try { saveBlob(b as Blob, "x.png", env); } catch (e) { msg = (e as Error).message; }
    expect(msg).toContain("Nothing to save");
    expect(log).toHaveLength(0);
  }
});

test("if the click throws, the link is still removed and the URL still scheduled for release", () => {
  const { env, log, anchor, timers } = fakeEnv();
  (anchor as unknown as { click: () => void }).click = () => { throw new Error("blocked"); };
  let msg = ""; try { saveBlob(blob(), "x.png", env); } catch (e) { msg = (e as Error).message; }
  expect(msg).toBe("blocked");
  expect(log).toContain("removed");
  expect(timers).toHaveLength(1);
});

test("canvasToBlob resolves a blob", async () => {
  const canvas = { toBlob: (cb: (b: Blob | null) => void) => cb(blob()) } as unknown as HTMLCanvasElement;
  expect((await canvasToBlob(canvas)).size).toBe(4);
});

test("canvasToBlob rejects with a helpful message when the browser returns null (oversize canvas)", async () => {
  const canvas = { toBlob: (cb: (b: Blob | null) => void) => cb(null) } as unknown as HTMLCanvasElement;
  let msg = ""; try { await canvasToBlob(canvas); } catch (e) { msg = (e as Error).message; }
  expect(msg).toContain("too large");
});

test("canvasToBlob turns a thrown toBlob into a rejection", async () => {
  const canvas = { toBlob: () => { throw new Error("SecurityError: tainted canvas"); } } as unknown as HTMLCanvasElement;
  let msg = ""; try { await canvasToBlob(canvas); } catch (e) { msg = (e as Error).message; }
  expect(msg).toContain("tainted");
});

test("dataUrlToBlob round-trips a 5 MB base64 PNG byte for byte", async () => {
  const src = new Uint8Array(5 * 1024 * 1024);
  src.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  for (let i = 8; i < src.length; i++) src[i] = (i * 31) & 255;
  const url = "data:image/png;base64," + Buffer.from(src).toString("base64");
  const b = dataUrlToBlob(url);
  expect(b.type).toBe("image/png");
  const out = new Uint8Array(await b.arrayBuffer());
  expect(out.length).toBe(src.length);
  expect(Array.from(out.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  expect(Buffer.compare(Buffer.from(out), Buffer.from(src))).toBe(0);
});

test("dataUrlToBlob decodes a non-base64 text URL", async () => {
  expect(await dataUrlToBlob("data:text/plain,hello%20world").text()).toBe("hello world");
});

test("dataUrlToBlob defaults the type when the mime is empty", () => {
  expect(dataUrlToBlob("data:;base64,QUJD").type).toBe("application/octet-stream");
});

test("dataUrlToBlob throws on malformed input", () => {
  for (const bad of ["", "nodata", "http://x/y", "data:image/png;base64", "data:image/png;base64,", "data:image/png;base64,@@@"]) {
    let threw = false;
    try { dataUrlToBlob(bad); } catch { threw = true; }
    expect(threw).toBe(true);
  }
});

test("extensionForBlob matches the real type", () => {
  expect(extensionForBlob(new Blob([], { type: "image/jpeg" }))).toBe("jpg");
  expect(extensionForBlob(new Blob([], { type: "image/webp" }))).toBe("webp");
  expect(extensionForBlob(new Blob([], { type: "image/svg+xml" }))).toBe("svg");
  expect(extensionForBlob(new Blob([], { type: "image/png" }))).toBe("png");
  expect(extensionForBlob(new Blob([], { type: "application/zip" }))).toBe("png");
});

import { saveImageToDevice, type ShareEnv } from "./save-file";
function shareEnv(over: Partial<ShareEnv> = {}) {
  const calls: string[] = [];
  const env: ShareEnv = { isTouchDevice: () => true, canShareFiles: () => true, canDownloadLink: () => true, share: async () => { calls.push("share"); }, ...over };
  return { env, calls };
}
test("on a phone that can share files, an image opens the share sheet and is not also downloaded", async () => {
  const { env, calls } = shareEnv(); const f = fakeEnv();
  expect(await saveImageToDevice(blob(), "a.png", env, f.env)).toBe("shared");
  expect(calls).toEqual(["share"]); expect(f.log).toEqual([]);
});
test("on a desktop, an image is downloaded and the share sheet is never opened", async () => {
  const { env, calls } = shareEnv({ isTouchDevice: () => false }); const f = fakeEnv();
  expect(await saveImageToDevice(blob(), "a.png", env, f.env)).toBe("downloaded");
  expect(calls).toEqual([]); expect(f.log).toContain("click-attached");
});
test("PHONE: when the browser cannot share files, it shows the press-and-hold image, never a download link (that goes to Files, not Photos)", async () => {
  const { env } = shareEnv({ canShareFiles: () => false }); const f = fakeEnv();
  expect(await saveImageToDevice(blob(), "a.png", env, f.env)).toBe("manual");
  expect(f.log).toEqual([]);
});
test("DESKTOP: when the browser cannot share files, it falls back to a download", async () => {
  const { env } = shareEnv({ isTouchDevice: () => false, canShareFiles: () => false }); const f = fakeEnv();
  expect(await saveImageToDevice(blob(), "a.png", env, f.env)).toBe("downloaded");
});
test("closing the share sheet is not an error and does not download", async () => {
  const { env } = shareEnv({ share: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; } }); const f = fakeEnv();
  expect(await saveImageToDevice(blob(), "a.png", env, f.env)).toBe("cancelled");
  expect(f.log).toEqual([]);
});
test("PHONE: any other share failure shows the press-and-hold image, not a download", async () => {
  const { env } = shareEnv({ share: async () => { throw new Error("boom"); } }); const f = fakeEnv();
  expect(await saveImageToDevice(blob(), "a.png", env, f.env)).toBe("manual");
  expect(f.log).toEqual([]);
});
test("a non-image file is never sent to the share sheet", async () => {
  const { env, calls } = shareEnv(); const f = fakeEnv();
  expect(await saveImageToDevice(new Blob(["x"], { type: "application/json" }), "a.json", env, f.env)).toBe("downloaded");
  expect(calls).toEqual([]);
});
test("an empty blob is a clear error", async () => {
  let msg = ""; try { await saveImageToDevice(new Blob([], { type: "image/png" }), "a.png", shareEnv().env); } catch (e) { msg = (e as Error).message; }
  expect(msg).toContain("Nothing to save");
});

test("success is not reported until the share promise resolves", async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => { release = r; });
  const { env } = shareEnv({ share: () => gate }); const f = fakeEnv();
  let result: string | null = null;
  const pending = saveImageToDevice(blob(), "a.png", env, f.env).then((r) => { result = r; });
  await Promise.resolve(); await Promise.resolve();
  expect(result).toBe(null);
  release(); await pending;
  expect(result).toBe("shared");
});
test("the object URL is released after 2 seconds, not immediately", async () => {
  const { env } = shareEnv({ isTouchDevice: () => false }); const f = fakeEnv();
  await saveImageToDevice(blob(), "a.png", env, f.env);
  expect(f.timers.length).toBe(1);
  expect(f.timers[0].ms).toBe(REVOKE_DELAY_MS);
  expect(REVOKE_DELAY_MS).toBeGreaterThanOrEqual(1000);
  expect(REVOKE_DELAY_MS).toBeLessThanOrEqual(2000);
  expect(f.log).not.toContain("revoke blob:fake");
});
test("when neither sharing nor download links work, it returns manual so the press-and-hold modal opens", async () => {
  const { env } = shareEnv({ canShareFiles: () => false, canDownloadLink: () => false }); const f = fakeEnv();
  expect(await saveImageToDevice(blob(), "a.png", env, f.env)).toBe("manual");
  expect(f.log).toEqual([]);
});
test("if the download link itself throws, it returns manual instead of claiming a download", async () => {
  const { env } = shareEnv({ isTouchDevice: () => false });
  const f = fakeEnv();
  f.env.createObjectURL = () => { throw new Error("blocked"); };
  expect(await saveImageToDevice(blob(), "a.png", env, f.env)).toBe("manual");
});
test("PHONE: a real share failure (NotAllowedError, not a cancel) falls back to press-and-hold", async () => {
  const { env } = shareEnv({ share: async () => { const e = new Error("denied"); e.name = "NotAllowedError"; throw e; } }); const f = fakeEnv();
  expect(await saveImageToDevice(blob(), "a.png", env, f.env)).toBe("manual");
});
test("DESKTOP: a share failure never happens (share is not tried), the download link is used and attached before the click", async () => {
  const { env, calls } = shareEnv({ isTouchDevice: () => false, share: async () => { throw new Error("must not be called"); } }); const f = fakeEnv();
  expect(await saveImageToDevice(blob(), "a.png", env, f.env)).toBe("downloaded");
  expect(calls).toEqual([]);
  expect(f.log).toContain("click-attached");
});

import { isPhoneOrTablet } from "./save-file";
const UA = {
  iphoneSafari: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  iphoneChrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1",
  ipadAsMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  androidChrome: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
  androidDesktopSite: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  samsung: "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0 Mobile Safari/537.36",
  macDesktop: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  windows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
  linuxDesktop: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
};
test("isPhoneOrTablet: ordinary phones", () => {
  expect(isPhoneOrTablet({ maxTouchPoints: 5, userAgent: UA.iphoneSafari })).toBe(true);
  expect(isPhoneOrTablet({ maxTouchPoints: 5, userAgent: UA.iphoneChrome })).toBe(true);
  expect(isPhoneOrTablet({ maxTouchPoints: 5, userAgent: UA.androidChrome })).toBe(true);
  expect(isPhoneOrTablet({ maxTouchPoints: 5, userAgent: UA.samsung })).toBe(true);
});
test("isPhoneOrTablet: an iPad or an iPhone on 'Request Desktop Site' reports as a Mac but has a touch screen", () => {
  expect(isPhoneOrTablet({ maxTouchPoints: 5, userAgent: UA.ipadAsMac })).toBe(true);
});
test("isPhoneOrTablet: Android with 'Desktop site' reports Linux but has a touch screen", () => {
  expect(isPhoneOrTablet({ maxTouchPoints: 5, userAgent: UA.androidDesktopSite })).toBe(true);
});
test("isPhoneOrTablet: real desktops are not phones", () => {
  expect(isPhoneOrTablet({ maxTouchPoints: 0, userAgent: UA.macDesktop })).toBe(false);
  expect(isPhoneOrTablet({ maxTouchPoints: 0, userAgent: UA.linuxDesktop })).toBe(false);
  expect(isPhoneOrTablet({ maxTouchPoints: 0, userAgent: UA.windows })).toBe(false);
});
test("isPhoneOrTablet: a Mac with a trackpad that reports 1 touch point is still a desktop", () => {
  expect(isPhoneOrTablet({ maxTouchPoints: 1, userAgent: UA.macDesktop })).toBe(false);
});
test("isPhoneOrTablet: a touch-screen Windows laptop is not treated as a phone", () => {
  expect(isPhoneOrTablet({ maxTouchPoints: 10, userAgent: UA.windows })).toBe(false);
});
test("isPhoneOrTablet: no navigator (server render) is false and does not throw", () => {
  expect(isPhoneOrTablet(undefined)).toBe(false);
  expect(isPhoneOrTablet({})).toBe(false);
});

import { maxExportWidth, MOBILE_CANVAS_MAX_PIXELS } from "./save-file";
const fits = (w: number, aspect: number) => w * Math.round(w / aspect) <= MOBILE_CANVAS_MAX_PIXELS;
test("maxExportWidth: a desktop is never capped", () => {
  expect(maxExportWidth(7680, 0.75, false)).toBe(7680);
});
test("maxExportWidth: sizes that already fit on a phone are unchanged", () => {
  expect(maxExportWidth(1024, 0.75, true)).toBe(1024);
  expect(maxExportWidth(2048, 0.75, true)).toBe(2048);
  expect(maxExportWidth(4096, 4 / 3, true)).toBe(4096);
});
test("maxExportWidth: 4K portrait and 8K are capped to something that really fits the iOS canvas limit", () => {
  for (const aspect of [0.5, 0.75, 1, 4 / 3, 2]) for (const req of [4096, 7680]) {
    const w = maxExportWidth(req, aspect, true);
    expect(w).toBeLessThanOrEqual(req);
    expect(fits(w, aspect)).toBe(true);
  }
  expect(maxExportWidth(4096, 0.75, true)).toBeLessThan(4096);
  expect(maxExportWidth(7680, 0.75, true)).toBeLessThan(4096);
});
test("maxExportWidth: the cap is not wastefully low (within 1% of the true limit)", () => {
  const w = maxExportWidth(7680, 1, true);
  expect(w).toBeGreaterThan(4096 * 0.98);
});
test("maxExportWidth: bad input never throws or returns NaN", () => {
  expect(maxExportWidth(4096, 0, true)).toBeGreaterThan(0);
  expect(maxExportWidth(4096, NaN, true)).toBeGreaterThan(0);
  expect(maxExportWidth(0, 1, true)).toBe(0);
});
