import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { STENCIL_PRESETS, type StencilPreset } from "@/lib/stencil-engine";

export default defineTool({
  name: "get_stencil_presets",
  title: "Get stencil engine presets",
  description:
    "Return the stencil engine's preset settings (threshold, edge mode, line thickness, smoothing) so you can recommend settings for a given tattoo style.",
  inputSchema: {
    preset: z
      .string()
      .trim()
      .min(1)
      .optional()
      .describe("Optional preset name, e.g. tattoo, fineline, bold. Omit for all presets."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ preset }) => {
    if (preset) {
      const key = preset.toLowerCase() as StencilPreset;
      const found = (STENCIL_PRESETS as Record<string, unknown>)[key];
      if (!found)
        return {
          content: [
            {
              type: "text",
              text: `Unknown preset "${preset}". Available: ${Object.keys(STENCIL_PRESETS).join(", ")}`,
            },
          ],
          isError: true,
        };
      return {
        content: [{ type: "text", text: JSON.stringify({ [key]: found }, null, 2) }],
        structuredContent: { preset: key, settings: found },
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(STENCIL_PRESETS, null, 2) }],
      structuredContent: { presets: STENCIL_PRESETS },
    };
  },
});
