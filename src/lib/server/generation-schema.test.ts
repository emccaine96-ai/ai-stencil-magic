import { expect, test } from "bun:test";
import { GenerateStencilInput } from "./generation-schema";
import { MAX_IMAGE_B64_CHARS } from "./ai-config";

const UUID = "3f2b8c1e-5a47-4d0e-9b61-2c7a1f0e8d11";
const img = (over: Record<string, unknown> = {}) => ({ mimeType: "image/jpeg", data: "QUJDREVGR0g=", ...over });
const good = (over: Record<string, unknown> = {}) => ({ style: "hatching", intensity: 0.5, images: [img()], requestId: UUID, ...over });
const ok = (v: unknown) => GenerateStencilInput.safeParse(v).success;

test("a valid minimal request passes", () => { expect(ok(good())).toBe(true); });
test("all four styles are accepted, anything else is rejected", () => {
  for (const s of ["hatching", "solid", "dotwork", "hybrid"]) expect(ok(good({ style: s }))).toBe(true);
  for (const s of ["watercolor", "", "HATCHING", null, 3]) expect(ok(good({ style: s }))).toBe(false);
});
test("intensity must be a number from 0 to 1 inclusive", () => {
  for (const v of [0, 0.25, 0.73, 1]) expect(ok(good({ intensity: v }))).toBe(true);
  for (const v of [-0.01, 1.01, 5, NaN, "0.5", null]) expect(ok(good({ intensity: v }))).toBe(false);
});
test("customNote: up to 500 characters", () => {
  expect(ok(good({ customNote: "x".repeat(500) }))).toBe(true);
  expect(ok(good({ customNote: "x".repeat(501) }))).toBe(false);
  expect(ok(good({ customNote: "" }))).toBe(true);
});
test("images: 1 to 3, never 0 and never 4", () => {
  expect(ok(good({ images: [] }))).toBe(false);
  expect(ok(good({ images: [img()] }))).toBe(true);
  expect(ok(good({ images: [img(), img(), img()] }))).toBe(true);
  expect(ok(good({ images: [img(), img(), img(), img()] }))).toBe(false);
  expect(ok(good({ images: undefined }))).toBe(false);
});
test("only png, jpeg and webp are accepted", () => {
  for (const m of ["image/png", "image/jpeg", "image/webp"]) expect(ok(good({ images: [img({ mimeType: m })] }))).toBe(true);
  for (const m of ["image/gif", "image/svg+xml", "application/pdf", "text/html", ""]) expect(ok(good({ images: [img({ mimeType: m })] }))).toBe(false);
});
test("image data must be raw base64: no data: prefix, no spaces, no markup", () => {
  expect(ok(good({ images: [img({ data: "data:image/png;base64,QUJD" })] }))).toBe(false);
  expect(ok(good({ images: [img({ data: "QUJD REVG" })] }))).toBe(false);
  expect(ok(good({ images: [img({ data: "<script>alert(1)</script>" })] }))).toBe(false);
  expect(ok(good({ images: [img({ data: "QUJD\nREVG" })] }))).toBe(false);
  expect(ok(good({ images: [img({ data: "" })] }))).toBe(false);
  expect(ok(good({ images: [img({ data: "QUJDREVGR0g=" })] }))).toBe(true);
});
test("image data at the size limit passes and one character over fails", () => {
  expect(ok(good({ images: [img({ data: "A".repeat(MAX_IMAGE_B64_CHARS) })] }))).toBe(true);
  expect(ok(good({ images: [img({ data: "A".repeat(MAX_IMAGE_B64_CHARS + 1) })] }))).toBe(false);
});
test("requestId must be a UUID", () => {
  expect(ok(good({ requestId: "not-a-uuid" }))).toBe(false);
  expect(ok(good({ requestId: "" }))).toBe(false);
  expect(ok(good({ requestId: undefined }))).toBe(false);
  expect(ok(good({ requestId: UUID }))).toBe(true);
});
test("tier is optional, limited to known values, and has no effect on the parsed cost (there is no cost field)", () => {
  expect(ok(good({ tier: "standard" }))).toBe(true);
  expect(ok(good({ tier: "master" }))).toBe(true);
  expect(ok(good({ tier: "free-unlimited" }))).toBe(false);
  const parsed = GenerateStencilInput.parse(good({ tier: "master", cost: 0, model: "openai/expensive" }));
  expect("cost" in parsed).toBe(false);
  expect("model" in parsed).toBe(false);
});
test("a client cannot smuggle in a model or a cost: unknown keys are dropped from the parsed output", () => {
  const parsed = GenerateStencilInput.parse(good({ model: "anthropic/claude-opus-image", cost: 0, openrouterKey: "sk-or-x", userId: "someone-else" })) as Record<string, unknown>;
  for (const k of ["model", "cost", "openrouterKey", "userId"]) expect(k in parsed).toBe(false);
});
