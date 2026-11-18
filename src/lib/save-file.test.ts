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

test("the object URL is revoked only after the delay, so a large file is not cut off", () => {
  const { env, log, timers } = fakeEnv();
  saveBlob(blob(), "a.png", env);
  expect(timers).toHaveLength(1);
  expect(timers[0].ms).toBe(REVOKE_DELAY_MS);
  expect(REVOKE_DELAY_MS).toBeGreaterThanOrEqual(10_000);
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
  const env: ShareEnv = { isTouchDevice: () => true, canShareFiles: () => true, share: async () => { calls.push("share"); }, ...over };
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
test("when the browser cannot share files, it falls back to a download", async () => {
  const { env } = shareEnv({ canShareFiles: () => false }); const f = fakeEnv();
  expect(await saveImageToDevice(blob(), "a.png", env, f.env)).toBe("downloaded");
});
test("closing the share sheet is not an error and does not download", async () => {
  const { env } = shareEnv({ share: async () => { const e = new Error("x"); e.name = "AbortError"; throw e; } }); const f = fakeEnv();
  expect(await saveImageToDevice(blob(), "a.png", env, f.env)).toBe("cancelled");
  expect(f.log).toEqual([]);
});
test("any other share failure falls back to a download", async () => {
  const { env } = shareEnv({ share: async () => { throw new Error("boom"); } }); const f = fakeEnv();
  expect(await saveImageToDevice(blob(), "a.png", env, f.env)).toBe("downloaded");
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
