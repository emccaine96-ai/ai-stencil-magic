import { useState } from "react";
import { Loader2, Sparkles, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { cleanUpPromptText } from "@/lib/prompt-cleanup";

type Props = {
  value: string;
  onChange: (v: string) => void;
  openrouterKey?: string;
  geminiKey?: string;
};

export function CustomPromptPanel({ value, onChange, openrouterKey, geminiKey }: Props) {
  const [open, setOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [lastRaw, setLastRaw] = useState<string | null>(null);

  async function onClean() {
    if (!value.trim()) {
      toast.error("Write some custom instructions first");
      return;
    }
    setCleaning(true);
    setLastRaw(value);
    try {
      const res = await cleanUpPromptText({
        raw: value,
        openrouterKey: openrouterKey || undefined,
        geminiKey: geminiKey || undefined,
      });
      onChange(res.text);
      if (res.source === "local") {
        toast.info("No API key for AI cleanup — applied local rewrite. Add a key in Settings for better results.");
      } else {
        toast.success("Prompt cleaned up");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cleanup failed");
    } finally {
      setCleaning(false);
    }
  }

  function onUndo() {
    if (lastRaw !== null) {
      onChange(lastRaw);
      setLastRaw(null);
      toast.success("Restored previous text");
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1"
        aria-expanded={open}
      >
        <span>Advanced: custom instructions</span>
        <span className="text-[10px]">{open ? "▲" : "▼"}</span>
      </button>
      {open ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Optional — add extra instructions for this generation (e.g. thicker outlines, less shading on the cheek, more traditional American). Style and shading rules above are always kept."
            rows={4}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary resize-none"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onClean}
              disabled={cleaning || !value.trim()}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-40"
            >
              {cleaning ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Clean up my prompt
            </button>
            {lastRaw !== null ? (
              <button
                type="button"
                onClick={onUndo}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                <Undo2 size={12} /> Undo
              </button>
            ) : null}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Rewrites your notes into clearer stencil instructions while keeping hard rules (white background, ink color, closed contours, identity).
          </p>
        </div>
      ) : null}
    </section>
  );
}
