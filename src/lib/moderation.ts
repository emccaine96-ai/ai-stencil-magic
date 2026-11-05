import { supabase } from "@/integrations/supabase/client";

export const REPORT_REASONS = [
  "Spam",
  "Nudity or sexual content",
  "Hate or harassment",
  "Violence",
  "Stolen artwork",
  "Other",
] as const;

export async function reportPost(postId: string, reason: string, note: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Please sign in to report.");
  const full = note.trim() ? `${reason}: ${note.trim().slice(0, 1000)}` : reason;
  const { error } = await supabase
    .from("gallery_reports")
    .insert({ post_id: postId, reporter_id: data.user.id, reason: full });
  if (error) {
    if (error.code === "23505") throw new Error("You already reported this post.");
    throw new Error("Could not send the report. Please try again.");
  }
}

export async function blockUser(blockedId: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Please sign in to block users.");
  if (data.user.id === blockedId) throw new Error("You can't block yourself.");
  const { error } = await supabase
    .from("user_blocks")
    .insert({ blocker_id: data.user.id, blocked_id: blockedId });
  if (error && error.code !== "23505") throw new Error("Could not block this user.");
}

export async function unblockUser(blockedId: string) {
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { error } = await supabase
    .from("user_blocks")
    .delete()
    .eq("blocker_id", data.user.id)
    .eq("blocked_id", blockedId);
  if (error) throw new Error("Could not unblock this user.");
}

export async function listBlocked(): Promise<{ blocked_id: string; created_at: string }[]> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return [];
  const { data } = await supabase
    .from("user_blocks")
    .select("blocked_id, created_at")
    .eq("blocker_id", u.user.id)
    .order("created_at", { ascending: false });
  return data ?? [];
}
