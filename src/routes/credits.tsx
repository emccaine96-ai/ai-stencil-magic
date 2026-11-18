import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyCredits, type LedgerRow } from "@/lib/credits.functions";
import { COST_PER_GENERATION, SIGNUP_GRANT } from "@/lib/ai-server/ai-config";

export const Route = createFileRoute("/credits")({
  head: () => ({
    meta: [
      { title: "Credits — AI Stencil Magic" },
      { name: "description", content: "Your credit balance and history." },
    ],
  }),
  component: CreditsPage,
});

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; balance: number; ledger: LedgerRow[] };

const REASON_LABELS: Record<string, string> = {
  signup: "Welcome credits",
  generation: "Cloud generation",
  refund: "Refund",
};

function CreditsPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // This page is for signed-in users. Check the session here instead of adding a separate route gate.
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        navigate({ to: "/auth", search: { next: "/credits" } });
        return;
      }
      try {
        const r = await getMyCredits();
        if (cancelled) return;
        if (!r.ok) setState({ kind: "error", message: r.error });
        else setState({ kind: "ready", balance: r.balance, ledger: r.ledger });
      } catch (e) {
        console.error("[credits] load failed", e);
        if (!cancelled) setState({ kind: "error", message: "Could not load your credits. Please try again." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Credits</h1>
          <Link to="/create" className="text-sm underline">
            Back to create
          </Link>
        </div>

        {state.kind === "loading" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={16} className="animate-spin" /> Loading your credits...
          </div>
        )}

        {state.kind === "error" && (
          <p role="alert" className="rounded-md border border-border bg-card p-4 text-sm">
            {state.message}
          </p>
        )}

        {state.kind === "ready" && (
          <>
            <section className="rounded-lg border border-border bg-card p-5">
              <div className="text-sm text-muted-foreground">Balance</div>
              <div className="text-4xl font-semibold" aria-label="credit balance">
                {state.balance}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Each cloud generation uses {COST_PER_GENERATION} credit. New accounts receive {SIGNUP_GRANT} credits once. Using your own
                API key never uses credits.
              </p>
              <p className="mt-3 text-xs">Buy credits coming soon.</p>
            </section>

            <section>
              <h2 className="mb-2 text-sm font-medium">History</h2>
              {state.ledger.length === 0 ? (
                <p className="text-sm text-muted-foreground">No credit activity yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">Date</th>
                      <th className="py-2 font-medium">Reason</th>
                      <th className="py-2 text-right font-medium">Credits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.ledger.map((row) => (
                      <tr key={row.id} className="border-b border-border/50">
                        <td className="py-2">{new Date(row.created_at).toLocaleString()}</td>
                        <td className="py-2">{REASON_LABELS[row.reason] ?? row.reason}</td>
                        <td className="py-2 text-right tabular-nums">{row.delta > 0 ? `+${row.delta}` : row.delta}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}
