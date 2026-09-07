import type { TuningSuggestion } from "@/lib/photo-analysis";

export function PhotoAnalysisBanner({
  suggestion,
  onApply,
  onDismiss,
}: {
  suggestion: TuningSuggestion;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-3 text-xs space-y-2">
      <div className="font-semibold text-primary">Suggested settings for this photo</div>
      <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
        {suggestion.reasoning.map((r, i) => <li key={i}>{r}</li>)}
      </ul>
      <div className="flex gap-2 pt-1">
        <button onClick={onApply} className="rounded-full bg-primary text-primary-foreground px-3 py-1.5 font-semibold">
          Apply suggestion
        </button>
        <button onClick={onDismiss} className="rounded-full border border-border px-3 py-1.5 text-muted-foreground">
          Keep my settings
        </button>
      </div>
    </div>
  );
}
