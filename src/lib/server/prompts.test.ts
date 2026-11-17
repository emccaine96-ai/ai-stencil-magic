import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { STYLE_PROMPTS as SERVER_STYLE_PROMPTS, buildPrompt as serverBuildPrompt, type Style } from "./prompts";

/**
 * Drift guard. Reads the CLIENT copy of STYLE_PROMPTS and buildPrompt straight out of src/routes/create.tsx, evaluates it,
 * and requires the server copy to produce byte-identical output. The client source is located with a regex (independent of
 * scripts/extract-server-prompts.mjs, which writes the server copy) so the two cannot agree by sharing a bug.
 */
const createSrc = readFileSync(join(process.cwd(), "src/routes/create.tsx"), "utf8");

function grab(re: RegExp, what: string): string {
  const m = createSrc.match(re);
  if (!m) throw new Error(`could not find ${what} in create.tsx`);
  return m[0];
}
const stylePromptsSrc = grab(/const STYLE_PROMPTS: Record<Style, string> = \{[\s\S]*?\n\};/, "STYLE_PROMPTS");
const buildPromptSrc = grab(/function buildPrompt\(o: \{ style: Style; intensity: number; customPrompt\?: string \}\) \{[\s\S]*?\n\}/, "buildPrompt");

// Strip the TypeScript annotations so the source can be evaluated as plain JS, without changing any string content.
const js = (stylePromptsSrc + "\n" + buildPromptSrc)
  .replace("const STYLE_PROMPTS: Record<Style, string> =", "const STYLE_PROMPTS =")
  .replace("function buildPrompt(o: { style: Style; intensity: number; customPrompt?: string })", "function buildPrompt(o)");
const client = new Function(`${js}\nreturn { STYLE_PROMPTS, buildPrompt };`)() as {
  STYLE_PROMPTS: Record<Style, string>;
  buildPrompt: (o: { style: Style; intensity: number; customPrompt?: string }) => string;
};

const STYLES: Style[] = ["hatching", "solid", "dotwork", "hybrid"];
const INTENSITIES = [0, 0.25, 0.5, 0.73, 1];
const CUSTOM = [undefined, "", "   ", "make the lines bolder, keep the eyes soft", "line one\nline two with \"quotes\" and ${braces} and `ticks`"];

test("the client source was actually found and is non-trivial", () => {
  expect(Object.keys(client.STYLE_PROMPTS).sort()).toEqual([...STYLES].sort());
  for (const s of STYLES) expect(client.STYLE_PROMPTS[s].length).toBeGreaterThan(50);
});

test("STYLE_PROMPTS are byte-identical for all four styles", () => {
  for (const s of STYLES) expect(SERVER_STYLE_PROMPTS[s]).toBe(client.STYLE_PROMPTS[s]);
  expect(Object.keys(SERVER_STYLE_PROMPTS).sort()).toEqual(Object.keys(client.STYLE_PROMPTS).sort());
});

test("buildPrompt is byte-identical for every style, intensity and custom prompt (100 combinations)", () => {
  let n = 0;
  for (const style of STYLES) for (const intensity of INTENSITIES) for (const customPrompt of CUSTOM) {
    expect(serverBuildPrompt({ style, intensity, customPrompt })).toBe(client.buildPrompt({ style, intensity, customPrompt }));
    n++;
  }
  expect(n).toBe(100);
});

test("the drift guard can fail: a one-character change in the server copy is detected", () => {
  const mutated = { ...SERVER_STYLE_PROMPTS, solid: SERVER_STYLE_PROMPTS.solid + " " };
  expect(mutated.solid).not.toBe(client.STYLE_PROMPTS.solid);
});

test("the prompt really depends on style and intensity (the comparison is not vacuous)", () => {
  const a = serverBuildPrompt({ style: "hatching", intensity: 0 });
  const b = serverBuildPrompt({ style: "dotwork", intensity: 1 });
  expect(a).not.toBe(b);
  expect(a.length).toBeGreaterThan(200);
});
