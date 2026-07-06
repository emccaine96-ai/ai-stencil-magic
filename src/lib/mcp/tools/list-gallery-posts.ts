import { defineTool } from "@lovable.dev/mcp-js";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

export default defineTool({
  name: "list_gallery_posts",
  title: "List gallery posts",
  description: "List public stencil/tattoo posts from the gallery, sorted by newest or top liked.",
  inputSchema: {
    sort: z.enum(["new", "top"]).default("new").describe("Sort order: new (recent) or top (most liked)."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum posts to return."),
    tag: z.string().optional().describe("Optional tag filter."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ sort, limit, tag }) => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    let q = supabase.from("gallery_posts")
      .select("id,user_id,title,description,tags,likes_count,created_at")
      .limit(limit);
    q = sort === "top"
      ? q.order("likes_count", { ascending: false })
      : q.order("created_at", { ascending: false });
    if (tag) q = q.contains("tags", [tag]);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { posts: data ?? [] },
    };
  },
});