import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Deletes the caller's account and all their app data.
 * credit_ledger and generation_requests are intentionally kept (accounting retention).
 */
export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const fail = (step: string, e: unknown) => {
      console.error(`[deleteMyAccount] ${step}`, (e as any)?.message ?? e);
      return { ok: false as const, error: `Could not delete your account (step: ${step}). Please try again.` };
    };

    const steps: Array<[string, () => PromiseLike<{ error: unknown }>]> = [
      ["likes", () => supabaseAdmin.from("gallery_likes").delete().eq("user_id", userId)],
      ["reports", () => supabaseAdmin.from("gallery_reports").delete().eq("reporter_id", userId)],
      ["blocks", () => supabaseAdmin.from("user_blocks").delete().eq("blocker_id", userId)],
      ["blocked-by", () => supabaseAdmin.from("user_blocks").delete().eq("blocked_id", userId)],
      ["gallery posts", () => supabaseAdmin.from("gallery_posts").delete().eq("user_id", userId)],
      ["brush packs", () => supabaseAdmin.from("brush_packs").delete().eq("user_id", userId)],
      ["cloud documents", () => supabaseAdmin.from("cloud_documents").delete().eq("user_id", userId)],
      ["profile", () => supabaseAdmin.from("profiles").delete().eq("id", userId)],
    ];
    for (const [name, run] of steps) {
      const { error } = await run();
      if (error) return fail(name, error);
    }

    // Storage: remove everything under a "<userId>/" folder in every bucket.
    const { data: buckets, error: bErr } = await supabaseAdmin.storage.listBuckets();
    if (bErr) return fail("storage", bErr);
    for (const b of buckets ?? []) {
      for (;;) {
        const { data: files, error } = await supabaseAdmin.storage
          .from(b.id)
          .list(userId, { limit: 1000 });
        if (error) return fail("storage", error);
        if (!files || files.length === 0) break;
        const { error: rmErr } = await supabaseAdmin.storage
          .from(b.id)
          .remove(files.map((f) => `${userId}/${f.name}`));
        if (rmErr) return fail("storage", rmErr);
        if (files.length < 1000) break;
      }
    }

    const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (delErr) return fail("auth user", delErr);
    return { ok: true as const };
  });
