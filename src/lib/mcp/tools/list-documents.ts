import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_documents",
  title: "List cloud stencil documents",
  description:
    "List the signed-in artist's synced stencil documents (name, id, last updated, share link status).",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(25).describe("Max documents to return."),
    search: z.string().trim().min(1).max(80).optional().describe("Filter by name substring."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit, search }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("cloud_documents")
      .select("id, local_id, name, updated_at, share_token")
      .order("updated_at", { ascending: false })
      .limit(limit ?? 25);
    if (search) q = q.ilike("name", `%${search}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = (data ?? []).map((r: any) => ({
      id: r.id,
      name: r.name,
      updatedAt: r.updated_at,
      shared: Boolean(r.share_token),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
      structuredContent: { documents: rows },
    };
  },
});
