import { useEffect, useState } from "react";
import { Flag, Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { REPORT_REASONS, reportPost, blockUser } from "@/lib/moderation";
import { supabase } from "@/integrations/supabase/client";

export function PostModerationActions({
  postId,
  authorId,
  onBlocked,
}: {
  postId: string;
  authorId: string;
  onBlocked?: (userId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [viewerId, setViewerId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    let authChanged = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authChanged = true;
      if (alive) setViewerId(session?.user.id ?? null);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (alive && !authChanged) setViewerId(data.session?.user.id ?? null);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  const stop = (e: React.SyntheticEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  async function submit(e: React.FormEvent) {
    stop(e);
    setBusy(true);
    try {
      await reportPost(postId, reason, note);
      toast.success("Thanks — your report was sent to moderation.");
      setOpen(false);
      setNote("");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function block(e: React.MouseEvent) {
    stop(e);
    if (!confirm("Block this user? You won't see their posts anymore.")) return;
    try {
      await blockUser(authorId);
      toast.success("User blocked. Manage blocked users in Settings.");
      onBlocked?.(authorId);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  if (viewerId === undefined || viewerId === authorId) return null;

  return (
    <>
      <div className="flex items-center gap-3 mt-2" onClick={stop}>
        <button
          onClick={(e) => {
            stop(e);
            setOpen(true);
          }}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <Flag className="w-3 h-3" /> Report
        </button>
        <button
          onClick={block}
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-destructive"
        >
          <Ban className="w-3 h-3" /> Block user
        </button>
      </div>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={(e) => {
            stop(e);
            setOpen(false);
          }}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-border bg-card p-5 space-y-3"
          >
            <h2 className="font-semibold">Report this post</h2>
            <div className="space-y-1.5">
              {REPORT_REASONS.map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="reason"
                    checked={reason === r}
                    onChange={() => setReason(r)}
                  />
                  {r}
                </label>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={1000}
              placeholder="Add a note (optional)"
              className="w-full h-20 px-3 py-2 rounded border border-border bg-background text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 text-sm rounded border border-border"
              >
                Cancel
              </button>
              <button
                disabled={busy}
                className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground inline-flex items-center gap-1"
              >
                {busy && <Loader2 className="w-3 h-3 animate-spin" />} Send report
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
