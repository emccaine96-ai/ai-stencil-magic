import { useState } from "react";
import { Loader2, Sparkles, X, Wand2 } from "lucide-react";

type Preset = { id: string; label: string; prompt: string };
const PRESETS: Preset[] = [
  { id: "clean", label: "Auto-clean lines", prompt: "Clean up this tattoo stencil. Remove noise and broken edges, make the linework crisp, uniform black on a clean white background, preserve composition." },
  { id: "ink", label: "Convert to clean ink", prompt: "Convert this image into a clean, bold black-ink tattoo stencil with smooth outlines and no shading, white background." },
  { id: "shade", label: "Add fine shading", prompt: "Add tasteful fine-line shading and stippling to this tattoo stencil while preserving the original outlines, black on white." },
  { id: "fineline", label: "Fine-line restyle", prompt: "Restyle this stencil in a delicate single-needle fine-line tattoo style with thin, even strokes, black on white." },
  { id: "neotrad", label: "Neo-traditional restyle", prompt: "Restyle this stencil in a bold neo-traditional tattoo style with strong outlines and decorative flourishes, black on white." },
];

export function AICopilotModal({
  sourceImage,
  onClose,
  onApply,
}: {
  sourceImage: string;
  onClose: () => void;
  onApply: (image: string, asNewLayer: boolean) => void;
}) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [asNewLayer, setAsNewLayer] = useState(true);

  async function run(finalPrompt: string) {
    setBusy(true); setError(null); setResult(null);
    try {
      const r = await fetch("/api/ai-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: finalPrompt, image: sourceImage }),
      });
      if (!r.ok) {
        const t = await r.text();
        if (r.status === 429) throw new Error("Rate limit hit — wait a moment and try again.");
        if (r.status === 402) throw new Error("AI credits exhausted. Add credits in workspace settings.");
        throw new Error(t || `Request failed (${r.status})`);
      }
      const j = await r.json();
      setResult(j.image);
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2"><Sparkles size={16} className="text-primary" /><h2 className="font-semibold text-sm">AI Co-Pilot</h2></div>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted"><X size={14} /></button>
        </header>

        <div className="p-4 space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">Quick actions</p>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map(p => (
                <button key={p.id} disabled={busy} onClick={() => run(p.prompt)}
                  className="text-left px-3 py-2 rounded border border-border bg-background hover:bg-muted text-xs disabled:opacity-50">
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">Custom prompt (inpaint / restyle)</p>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3}
              placeholder="e.g. add a snake wrapping around the dagger"
              className="w-full px-3 py-2 rounded border border-border bg-background text-sm" />
            <button disabled={busy || !prompt.trim()} onClick={() => run(prompt)}
              className="mt-2 inline-flex items-center gap-2 px-3 py-2 rounded bg-primary text-primary-foreground text-xs disabled:opacity-50">
              <Wand2 size={13} /> Generate
            </button>
          </div>

          {busy && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="animate-spin" size={14} /> Working…</div>}
          {error && <div className="text-xs text-destructive">{error}</div>}

          {result && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Preview</p>
              <img src={result} alt="AI result" className="w-full rounded border border-border bg-checker" />
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={asNewLayer} onChange={(e) => setAsNewLayer(e.target.checked)} /> Add as new layer (uncheck to replace active layer)</label>
              <div className="flex gap-2">
                <button onClick={() => onApply(result, asNewLayer)} className="px-3 py-2 rounded bg-primary text-primary-foreground text-xs">Apply</button>
                <button onClick={() => setResult(null)} className="px-3 py-2 rounded border border-border text-xs">Discard</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}