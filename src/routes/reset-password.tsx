import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — AI Stencil Magic" },
      { name: "description", content: "Choose a new password for your AI Stencil Magic account." },
      { property: "og:title", content: "Reset password — AI Stencil Magic" },
      { property: "og:description", content: "Choose a new password for your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session && isRecovery) setReady(true);
      else if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(true);
    setTimeout(() => navigate({ to: "/vault" }), 1500);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-lg p-6 space-y-4">
        <h1 className="font-semibold">Set a new password</h1>
        {done ? (
          <p className="text-sm">Password updated. Taking you to your vault…</p>
        ) : !ready ? (
          <p className="text-sm text-muted-foreground">
            Open this page from the reset link in your email. If the link expired,{" "}
            <Link to="/auth" className="underline">
              request a new one
            </Link>
            .
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input
              type="password"
              required
              minLength={8}
              placeholder="New password (min 8 characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
            />
            <button
              disabled={busy}
              className="w-full py-2 rounded bg-primary text-primary-foreground text-sm inline-flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="animate-spin" size={13} />} Update password
            </button>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </form>
        )}
      </div>
    </main>
  );
}
