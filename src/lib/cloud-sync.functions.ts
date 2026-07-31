import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const PushInput = z.object({
  localId: z.string().min(1).max(128),
  name: z.string().min(1).max(256),
  thumbnail: z.string().max(2_000_000).nullable().optional(),
  payload: z.unknown(),
});

export const pushDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PushInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error, data: row } = await supabase
      .from("cloud_documents")
      .upsert(
        {
          user_id: userId,
          local_id: data.localId,
          name: data.name,
          thumbnail: data.thumbnail ?? null,
          payload: data.payload as any,
        },
        { onConflict: "user_id,local_id" },
      )
      .select("id, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listCloudDocuments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("cloud_documents")
      .select("id, local_id, name, thumbnail, updated_at, share_token")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const pullDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase
      .from("cloud_documents")
      .select("*")
      .eq("id", data.id)
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCloudDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("cloud_documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setShareToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), enable: z.boolean() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const token = data.enable
      ? Array.from(crypto.getRandomValues(new Uint8Array(16)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("")
      : null;
    const { data: row, error } = await supabase
      .from("cloud_documents")
      .update({ share_token: token })
      .eq("id", data.id)
      .select("share_token")
      .single();
    if (error) throw new Error(error.message);
    return { share_token: row.share_token as string | null };
  });

export const getSharedDocument = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ token: z.string().min(8).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { supabase } = await import("@/integrations/supabase/client.server").then((m) => ({
      supabase: m.supabaseAdmin,
    }));
    const { data: row, error } = await supabase
      .from("cloud_documents")
      .select("name, thumbnail, payload, updated_at")
      .eq("share_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Not found");
    return row;
  });
