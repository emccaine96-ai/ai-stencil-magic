import { expect, test } from "bun:test";
import { callOpenRouter, extractImage, redactKey } from "./openrouter-call";
import { ProviderTimeoutError } from "./generate-core";

const KEY = "sk-or-v1-THIS-IS-A-FAKE-TEST-KEY-1234567890";
const IMG = "data:image/png;base64,iVBORw0KGgo=";
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
const args = (over: Record<string, unknown> = {}) => ({
  apiKey: KEY,
  model: "google/gemini-2.5-flash-image",
  prompt: "make a stencil",
  images: [{ mimeType: "image/jpeg", data: "QUJD" }],
  signal: new AbortController().signal,
  ...over,
});

test("extractImage: primary path message.images[0].image_url.url", () => {
  expect(extractImage({ choices: [{ message: { images: [{ image_url: { url: IMG } }] } }] })).toBe(IMG);
});
test("extractImage: message.images[0].url fallback", () => {
  expect(extractImage({ choices: [{ message: { images: [{ url: IMG }] } }] })).toBe(IMG);
});
test("extractImage: a data URL inlined in string content", () => {
  expect(extractImage({ choices: [{ message: { content: `here you go ${IMG} enjoy` } }] })).toBe(IMG);
});
test("extractImage: array content with a string part and an image_url part", () => {
  expect(extractImage({ choices: [{ message: { content: [`x ${IMG}`] } }] })).toBe(IMG);
  expect(extractImage({ choices: [{ message: { content: [{ type: "image_url", image_url: { url: IMG } }] } }] })).toBe(IMG);
});
test("extractImage: text-only content, empty, and malformed shapes return null", () => {
  expect(extractImage({ choices: [{ message: { content: "I cannot draw." } }] })).toBeNull();
  expect(extractImage({ choices: [] })).toBeNull();
  expect(extractImage({})).toBeNull();
  expect(extractImage(null)).toBeNull();
  expect(extractImage({ choices: [{ message: { images: [] } }] })).toBeNull();
  expect(extractImage({ choices: [{ message: { images: [{ image_url: { url: "" } }] } }] })).toBeNull();
});
test("extractImage prefers message.images over content", () => {
  expect(extractImage({ choices: [{ message: { images: [{ image_url: { url: IMG } }], content: "data:image/png;base64,OTHER" } }] })).toBe(IMG);
});

test("request: right endpoint, bearer key in the header only, modalities, model, prompt and every image", async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const fetchImpl = (async (url: string, init: RequestInit) => { seen = { url, init }; return ok({ choices: [{ message: { images: [{ image_url: { url: IMG } }] } }] }); }) as unknown as typeof fetch;
  const out = await callOpenRouter(args({ fetchImpl, images: [{ mimeType: "image/jpeg", data: "QUJD" }, { mimeType: "image/png", data: "REVG" }] }));
  expect(out).toBe(IMG);
  expect(seen!.url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(seen!.init.method).toBe("POST");
  const headers = seen!.init.headers as Record<string, string>;
  expect(headers.Authorization).toBe(`Bearer ${KEY}`);
  expect(headers["Content-Type"]).toBe("application/json");
  const body = JSON.parse(String(seen!.init.body));
  expect(body.model).toBe("google/gemini-2.5-flash-image");
  expect(body.modalities).toEqual(["image", "text"]);
  expect(body.messages[0].content[0]).toEqual({ type: "text", text: "make a stencil" });
  expect(body.messages[0].content[1].image_url.url).toBe("data:image/jpeg;base64,QUJD");
  expect(body.messages[0].content[2].image_url.url).toBe("data:image/png;base64,REVG");
  expect(String(seen!.init.body)).not.toContain(KEY);
});

test("the API key never appears in a thrown error or in logs, on any failure", async () => {
  const logs: string[] = [];
  const log = (m: string, d?: unknown) => logs.push(`${m} ${d ?? ""}`);
  const failing = (async () => new Response(`{"error":"bad key ${KEY} for account acct_123"}`, { status: 401 })) as unknown as typeof fetch;
  let msg = "";
  try { await callOpenRouter(args({ fetchImpl: failing, log })); } catch (e) { msg = (e as Error).message; }
  expect(msg).toBe("openrouter status 401");
  expect(msg).not.toContain(KEY);
  expect(msg).not.toContain("acct_123");
  // the upstream body is logged server-side, but the key itself must be redacted from the log
  expect(logs.length).toBe(1);
  expect(logs[0]).not.toContain(KEY);
  expect(logs[0]).toContain("[redacted-key]");
  expect(logs[0]).toContain("401");
});

test("redactKey removes every occurrence and tolerates an empty key", () => {
  expect(redactKey(`a ${KEY} b ${KEY} c`, KEY)).toBe("a [redacted-key] b [redacted-key] c");
  expect(redactKey("nothing here", KEY)).toBe("nothing here");
  expect(redactKey("keep me", "")).toBe("keep me");
});

test("a key placed near the 300-character cut is still redacted (redaction happens before truncation)", async () => {
  const logs: string[] = [];
  const pad = "y".repeat(280);
  const fetchImpl = (async () => new Response(pad + KEY + "tail", { status: 500 })) as unknown as typeof fetch;
  try { await callOpenRouter(args({ fetchImpl, log: (m: string, d?: unknown) => logs.push(`${m} ${d ?? ""}`) })); } catch { /* expected */ }
  expect(logs[0]).not.toContain("sk-or-v1");
  expect(logs[0]).not.toContain("THIS-IS-A-FAKE");
});

test("an upstream error body is never part of the thrown message (only the status)", async () => {
  const fetchImpl = (async () => new Response("INTERNAL: stack trace with secrets", { status: 500 })) as unknown as typeof fetch;
  let msg = ""; try { await callOpenRouter(args({ fetchImpl })); } catch (e) { msg = (e as Error).message; }
  expect(msg).toBe("openrouter status 500");
});

test("a 429 and a 402 are failures with only a status in the message", async () => {
  for (const status of [429, 402, 502]) {
    const fetchImpl = (async () => new Response("x", { status })) as unknown as typeof fetch;
    let msg = ""; try { await callOpenRouter(args({ fetchImpl })); } catch (e) { msg = (e as Error).message; }
    expect(msg).toBe(`openrouter status ${status}`);
  }
});

test("a 200 with no image is a failure", async () => {
  const fetchImpl = (async () => ok({ choices: [{ message: { content: "no image here" } }] })) as unknown as typeof fetch;
  let msg = ""; try { await callOpenRouter(args({ fetchImpl })); } catch (e) { msg = (e as Error).message; }
  expect(msg).toBe("openrouter returned no image");
});

test("a 200 with a non-JSON body is a failure", async () => {
  const fetchImpl = (async () => new Response("<html>gateway</html>", { status: 200 })) as unknown as typeof fetch;
  let msg = ""; try { await callOpenRouter(args({ fetchImpl })); } catch (e) { msg = (e as Error).message; }
  expect(msg).toBe("openrouter returned non-JSON");
});

test("an aborted fetch becomes a ProviderTimeoutError", async () => {
  const ac = new AbortController();
  const fetchImpl = ((_u: string, init: RequestInit) => new Promise((_, reject) => { init.signal!.addEventListener("abort", () => { const e = new Error("aborted"); e.name = "AbortError"; reject(e); }); })) as unknown as typeof fetch;
  const p = callOpenRouter(args({ fetchImpl, signal: ac.signal }));
  ac.abort();
  let err: unknown; try { await p; } catch (e) { err = e; }
  expect(err instanceof ProviderTimeoutError).toBe(true);
});

test("a network failure is an ordinary error, not a timeout", async () => {
  const fetchImpl = (async () => { throw new Error("ECONNRESET"); }) as unknown as typeof fetch;
  let err: unknown; try { await callOpenRouter(args({ fetchImpl })); } catch (e) { err = e; }
  expect(err instanceof ProviderTimeoutError).toBe(false);
  expect((err as Error).message).toBe("network error: ECONNRESET");
});
