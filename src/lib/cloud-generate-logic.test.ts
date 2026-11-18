import { expect, test } from "bun:test";
import { CODE_MESSAGES, FALLBACK_MESSAGE, RequestIdKeeper, dataUrlToImage, interpretResult, messageForCode } from "./cloud-generate-logic";

const seq = () => { let n = 0; return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`; };

test("a double tap while the first attempt is in flight reuses the same request id", () => {
  const k = new RequestIdKeeper(seq());
  const a = k.acquire();
  const b = k.acquire();
  expect(b).toBe(a);
});

test("after an attempt ends the next attempt gets a NEW id (so a retry is not rejected as a duplicate)", () => {
  const k = new RequestIdKeeper(seq());
  const a = k.acquire();
  k.release();
  const b = k.acquire();
  expect(b).not.toBe(a);
});

test("a new id is used after a success too, so the next stencil is not blocked as a duplicate", () => {
  const k = new RequestIdKeeper(seq());
  const first = k.acquire();
  k.release(); // success
  expect(k.acquire()).not.toBe(first);
});

test("ids are valid UUIDs when the default generator is used", () => {
  const k = new RequestIdKeeper();
  expect(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(k.acquire())).toBe(true);
});

test("every failure code has a user message, and none mention internals, keys or providers' raw text", () => {
  for (const [code, msg] of Object.entries(CODE_MESSAGES)) {
    expect(msg.length).toBeGreaterThan(10);
    for (const bad of ["sk-", "Bearer", "openrouter status", "stack", "undefined", "[object"]) expect(msg).not.toContain(bad);
    expect(messageForCode(code)).toBe(msg);
  }
});

test("failures that refund say the user was not charged", () => {
  expect(CODE_MESSAGES.provider_error).toContain("not charged");
  expect(CODE_MESSAGES.timeout).toContain("not charged");
  expect(FALLBACK_MESSAGE).toContain("not charged");
});

test("running out of credits points to the free own-key path", () => {
  expect(CODE_MESSAGES.insufficient_credits).toContain("own API key");
});

test("an unknown or malformed code falls back to the generic message", () => {
  for (const c of ["nope", "", undefined, null, 42, {}]) expect(messageForCode(c)).toBe(FALLBACK_MESSAGE);
});

test("interpretResult: a good image comes through with the balance", () => {
  expect(interpretResult({ ok: true, image: "data:image/png;base64,AAAA", balance: 2 })).toEqual({ kind: "image", dataUrl: "data:image/png;base64,AAAA", balance: 2 });
});

test("interpretResult: consent_required asks for consent instead of showing an error", () => {
  expect(interpretResult({ ok: false, code: "consent_required" })).toEqual({ kind: "needs_consent" });
});

test("interpretResult: other codes become a message", () => {
  expect(interpretResult({ ok: false, code: "insufficient_credits" })).toEqual({ kind: "error", message: CODE_MESSAGES.insufficient_credits });
});

test("interpretResult: a 'success' that is not an image data URL is treated as an error, never shown", () => {
  for (const image of ["", "https://evil.example/x.png", "javascript:alert(1)", "<svg/>", "data:text/html;base64,AAAA"]) {
    expect(interpretResult({ ok: true, image, balance: 1 } as never).kind).toBe("error");
  }
});

test("interpretResult: null, undefined and junk are errors", () => {
  for (const v of [null, undefined, "x", 3]) expect(interpretResult(v as never)).toEqual({ kind: "error", message: FALLBACK_MESSAGE });
});

test("dataUrlToImage splits a valid data URL", () => {
  expect(dataUrlToImage("data:image/jpeg;base64,QUJDRA==")).toEqual({ mimeType: "image/jpeg", data: "QUJDRA==" });
  expect(dataUrlToImage("data:image/png;base64,QUJD")).toEqual({ mimeType: "image/png", data: "QUJD" });
  expect(dataUrlToImage("data:image/WEBP;base64,QUJD")?.mimeType).toBe("image/webp");
});

test("dataUrlToImage rejects anything the server would reject", () => {
  for (const v of ["", "not a url", "data:image/gif;base64,QUJD", "data:image/svg+xml;base64,QUJD", "data:image/png;base64,", "data:image/png,QUJD", "data:image/png;base64,QU JD", "https://x/y.png"]) {
    expect(dataUrlToImage(v)).toBeNull();
  }
});
