import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_document",
  title: "Get stencil document details",
  description:
    "Fetch one of the signed-in artist's stencil documents: name, layer count, canvas size and timestamps. Image data is summarized, not returned.",
  inputSchema: { id: z.string().uuid().describe("Document id from list_documents.") },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ id }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("cloud_documents")
      .select("id, name, updated_at, share_token, payload")
      .eq("id", id)
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data) return { content: [{ type: "text", text: "Document not found" }], isError: true };
    const payload = (data as any).payload ?? {};
    const layers = Array.isArray(payload?.layeredEditorData?.layers)
      ? payload.layeredEditorData.layers
      : Array.isArray(payload?.layers)
        ? payload.layers
        : [];
    const summary = {
      id: data.id,
      name: (data as any).name,
      updatedAt: (data as any).updated_at,
      shared: Boolean((data as any).share_token),
      style: payload?.style ?? null,
      tags: payload?.tags ?? [],
      layerCount: layers.length,
      layerNames: layers.map((l: any) => l?.name ?? "layer").slice(0, 40),
      canvas: payload?.layeredEditorData?.width
        ? { width: payload.layeredEditorData.width, height: payload.layeredEditorData.height }
        : null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
