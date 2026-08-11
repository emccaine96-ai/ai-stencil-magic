import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "rename_document",
  title: "Rename a stencil document",
  description: "Rename one of the signed-in artist's synced stencil documents.",
  inputSchema: {
    id: z.string().uuid().describe("Document id from list_documents."),
    name: z.string().trim().min(1).max(256).describe("New document name."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  handler: async ({ id, name }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("cloud_documents")
      .update({ name })
      .eq("id", id)
      .select("id, name, updated_at")
      .maybeSingle();
    if (error) throw new ToolError(error.message);
    if (!data) throw new ToolError("Document not found");
    return {
      content: [{ type: "text", text: `Renamed to "${(data as any).name}"` }],
      structuredContent: { document: data },
    };
  },
});
