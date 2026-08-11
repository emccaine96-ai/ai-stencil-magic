import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_gallery_posts",
  title: "Browse the community gallery",
  description: "Browse published community stencil posts, newest or most liked first, optionally filtered by tag.",
  inputSchema: {
    sort: z.enum(["new", "top"]).default("new").describe("Order results by recency or likes."),
    tag: z.string().trim().min(1).max(40).optional().describe("Only posts carrying this tag."),
    limit: z.number().int().min(1).max(50).default(20).describe("Max posts to return."),
    mine: z.boolean().default(false).describe("Limit to the signed-in artist's own posts."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ sort, tag, limit, mine }, ctx) => {
    if (!ctx.isAuthenticated())
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const supabase = supabaseForUser(ctx);
    let q = supabase
      .from("gallery_posts")
      .select("id, title, description, tags, likes_count, created_at, user_id")
      .limit(limit ?? 20);
    q = sort === "top"
      ? q.order("likes_count", { ascending: false })
      : q.order("created_at", { ascending: false });
    if (tag) q = q.contains("tags", [tag]);
    if (mine) q = q.eq("user_id", ctx.getUserId() ?? "");
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const posts = (data ?? []).map((p: any) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      tags: p.tags ?? [],
      likes: p.likes_count ?? 0,
      createdAt: p.created_at,
      mine: p.user_id === ctx.getUserId(),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(posts, null, 2) }],
      structuredContent: { posts },
    };
  },
});
