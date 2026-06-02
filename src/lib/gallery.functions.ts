import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { supabase as browserSupabase } from "@/integrations/supabase/client";

const PublishInput = z.object({
  docId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional().nullable(),
  thumbnail: z.string().max(2_000_000).nullable().optional(),
  payload: z.unknown(),
  tags: z.array(z.string().min(1).max(40)).max(12).default([]),
  remixOf: z.string().uuid().nullable().optional(),
});

export const publishToGallery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => PublishInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("gallery_posts")
      .insert({
        user_id: userId,
        doc_id: data.docId ?? null,
        title: data.title,
        description: data.description ?? null,
        thumbnail: data.thumbnail ?? null,
        payload: data.payload as any,
        tags: data.tags,
        remix_of: data.remixOf ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

const ToggleLikeInput = z.object({ postId: z.string().uuid() });
export const toggleLike = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => ToggleLikeInput.parse(i))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("gallery_likes").select("post_id")
      .eq("post_id", data.postId).eq("user_id", userId).maybeSingle();
    if (existing) {
      const { error } = await supabase.from("gallery_likes").delete()
        .eq("post_id", data.postId).eq("user_id", userId);
      if (error) throw new Error(error.message);
      return { liked: false };
    }
    const { error } = await supabase.from("gallery_likes")
      .insert({ post_id: data.postId, user_id: userId });
    if (error) throw new Error(error.message);
    return { liked: true };
  });

export const deletePost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ postId: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("gallery_posts").delete().eq("id", data.postId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------- Public read helpers (browser client; RLS allows anon read) ---------- */
export type GalleryListItem = {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  thumbnail: string | null;
  tags: string[];
  likes_count: number;
  created_at: string;
};

export async function listGallery(opts: { sort?: "new" | "top"; limit?: number; tag?: string } = {}) {
  const { sort = "new", limit = 60, tag } = opts;
  let q = browserSupabase.from("gallery_posts")
    .select("id,user_id,title,description,thumbnail,tags,likes_count,created_at")
    .limit(limit);
  q = sort === "top" ? q.order("likes_count", { ascending: false })
                     : q.order("created_at", { ascending: false });
  if (tag) q = q.contains("tags", [tag]);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as GalleryListItem[];
}

export async function getGalleryPost(id: string) {
  const { data, error } = await browserSupabase.from("gallery_posts")
    .select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function hasLiked(postId: string, userId: string | null) {
  if (!userId) return false;
  const { data } = await browserSupabase.from("gallery_likes")
    .select("post_id").eq("post_id", postId).eq("user_id", userId).maybeSingle();
  return !!data;
}