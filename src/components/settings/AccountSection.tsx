import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { deleteMyAccount } from "@/lib/account.functions";
import { listBlocked, unblockUser } from "@/lib/moderation";

export function AccountSection() {
  const navigate = useNavigate();
  const del = useServerFn(deleteMyAccount);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState<{ blocked_id: string; created_at: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(!!data.user);
      if (data.user) listBlocked().then(setBlocked);
    });
  }, []);

  if (!signedIn) return null;

  async function unblock(id: string) {
    try {
      await unblockUser(id);
      setBlocked((b) => b.filter((x) => x.blocked_id !== id));
      toast.success("User unblocked.");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function confirmDelete() {
    setBusy(true);
    try {
      const res = await del();
      if (!res.ok) throw new Error(res.error);
      await supabase.auth.signOut();
      toast.success("Your account was deleted.");
      navigate({ to: "/" });
    } catch (e: any) {
      toast.error(e.message ?? "Could not delete your account.");
      setBusy(false);
    }
  }

  return (
    <>
      <section className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="font-semibold">Blocked users</h2>
        {blocked.length === 0 ? (
          <p className="text-sm text-muted-foreground">You haven't blocked anyone.</p>
        ) : (
          <ul className="space-y-2">
            {blocked.map((b) => (
              <li key={b.blocked_id} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs text-muted-foreground">
                  User {b.blocked_id.slice(0, 8)}… · blocked{" "}
                  {new Date(b.created_at).toLocaleDateString()}
                </span>
                <button
                  onClick={() => unblock(b.blocked_id)}
                  className="px-2.5 py-1 text-xs rounded border border-border hover:bg-muted"
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-destructive/40 bg-card p-5 space-y-3">
        <h2 className="font-semibold text-destructive">Delete account</h2>
        <p className="text-sm text-muted-foreground">
          Permanently delete your account and everything stored in the cloud for it.
        </p>
        <button
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 text-sm rounded bg-destructive text-destructive-foreground"
        >
          Delete account…
        </button>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-5 space-y-3">
            <h2 className="font-semibold">Delete your account?</h2>
            <p className="text-sm">This permanently deletes:</p>
            <ul className="text-sm list-disc pl-5 text-muted-foreground">
              <li>Your cloud documents</li>
              <li>Your gallery posts and likes</li>
              <li>Your brush packs</li>
              <li>Reports you've filed</li>
              <li>Your block list</li>
            </ul>
            <p className="text-sm text-muted-foreground">
              The local vault on this device is not affected.
            </p>
            <label className="block text-sm">
              Type <b>DELETE</b> to confirm
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded border border-border bg-background text-sm"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  setTyped("");
                }}
                disabled={busy}
                className="px-3 py-1.5 text-sm rounded border border-border"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={typed !== "DELETE" || busy}
                className="px-3 py-1.5 text-sm rounded bg-destructive text-destructive-foreground disabled:opacity-50 inline-flex items-center gap-1"
              >
                {busy && <Loader2 className="w-3 h-3 animate-spin" />} Delete forever
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
