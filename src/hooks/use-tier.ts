import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { effectiveTier, type Tier } from "@/lib/entitlements";

/** The signed-in user's plan. Signed-out or unknown resolves to "free". Read-only: RLS blocks client writes. */
export function useTier(): { tier: Tier; loading: boolean } {
  const [tier, setTier] = useState<Tier>("free");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const uid = s.session?.user.id;
        if (!uid) return alive && setTier("free");
        const { data } = await (supabase as any)
          .from("subscriptions")
          .select("tier,status")
          .eq("user_id", uid)
          .maybeSingle();
        if (alive) setTier(effectiveTier(data?.tier, data?.status));
      } catch {
        if (alive) setTier("free");
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return { tier, loading };
}
