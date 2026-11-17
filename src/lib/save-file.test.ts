import { expect, test } from "bun:test";
import { saveBlob, canvasToBlob, REVOKE_DELAY_MS, type SaveEnv } from "./save-file";

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
