import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ensureProfile } from "@/lib/credits.functions";

/**
 * Renders nothing. Once per signed-in user per page load it calls ensureProfile, which creates the profile row if it is missing
 * and grants the one-time signup credits. Safe to repeat: the server grant is keyed by 'signup:<userId>' on a unique index.
 * Covers both a fresh sign-in and a returning user whose session is restored, so existing users receive their credits too.
 * This is the app's only global auth listener (the root route had none).
 */
export function EnsureProfileOnSignIn() {
  useEffect(() => {
    let lastUserId: string | null = null;
    const run = (userId: string | undefined) => {
      if (!userId || userId === lastUserId) return;
      lastUserId = userId;
      ensureProfile().catch((e) => {
        console.error("[ensureProfile] failed", e);
        lastUserId = null; // allow a retry on the next auth event
      });
    };
    supabase.auth.getSession().then(({ data }) => run(data.session?.user.id));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "INITIAL_SESSION") run(session?.user.id);
      if (event === "SIGNED_OUT") lastUserId = null;
    });
    return () => subscription.unsubscribe();
  }, []);
  return null;
}
