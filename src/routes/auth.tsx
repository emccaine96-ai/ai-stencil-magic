import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Cloud, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — PrimalPrint AI" },
      { name: "description", content: "Sign in to sync your stencil vault across devices." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/vault" });
    });
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/vault" });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/vault" },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      setError(err.message ?? String(err));
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin + "/vault" },
      });
      if (error) throw error;
    } catch (e: any) {
      setError(e.message ?? String(e));
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm bg-card border border-border rounded-lg p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Cloud size={18} className="text-primary" />
          <h1 className="font-semibold">{mode === "signin" ? "Sign in" : "Create account"}</h1>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded border border-border bg-background text-sm"
          />
          <button
            disabled={busy}
            className="w-full py-2 rounded bg-primary text-primary-foreground text-sm inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 className="animate-spin" size={13} />}{" "}
            {mode === "signin" ? "Sign in" : "Sign up"}
          </button>
        </form>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <div className="flex-1 h-px bg-border" />
          OR
          <div className="flex-1 h-px bg-border" />
        </div>
        <button
          onClick={google}
          disabled={busy}
          className="w-full py-2 rounded border border-border text-sm hover:bg-muted"
        >
          Continue with Google
        </button>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground text-center">
          {mode === "signin" ? "No account?" : "Have an account?"}{" "}
          <button
            onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
            className="underline"
          >
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </p>
        <Link to="/" className="block text-center text-[11px] text-muted-foreground underline">
          Back to home
        </Link>
      </div>
    </main>
  );
}
