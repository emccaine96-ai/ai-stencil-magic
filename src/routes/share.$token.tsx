import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { getSharedDocument } from "@/lib/cloud-sync.functions";
import { Cloud } from "lucide-react";

export const Route = createFileRoute("/share/$token")({
  head: () => ({
    meta: [
      { title: "Shared stencil — AI Stencil Magic" },
      { name: "description", content: "View a shared AI Stencil Magic stencil." },
    ],
  }),
  component: SharePage,
});

function SharePage() {
  const { token } = useParams({ from: "/share/$token" });
  const [doc, setDoc] = useState<{
    name: string;
    thumbnail: string | null;
    updated_at: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getSharedDocument({ data: { token } })
      .then((d: any) => setDoc(d))
      .catch((e) => setErr(e.message ?? String(e)));
  }, [token]);

  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-8">
      <div className="flex items-center gap-2 mb-4 text-primary">
        <Cloud size={18} />
        <h1 className="font-semibold">Shared stencil</h1>
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      {!doc && !err && <p className="text-sm text-muted-foreground">Loading…</p>}
      {doc && (
        <div className="max-w-xl w-full bg-card border border-border rounded-lg p-4 space-y-3">
          <h2 className="font-semibold">{doc.name}</h2>
          {doc.thumbnail && (
            <img
              src={doc.thumbnail}
              alt={doc.name}
              className="w-full rounded border border-border bg-white"
            />
          )}
          <p className="text-[11px] text-muted-foreground">
            Updated {new Date(doc.updated_at).toLocaleString()}
          </p>
        </div>
      )}
    </main>
  );
}
