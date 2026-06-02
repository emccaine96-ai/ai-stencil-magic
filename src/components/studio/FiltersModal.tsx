import { useEffect, useMemo, useRef, useState } from "react";
import { X, Check } from "lucide-react";
import { applyFilter, FILTER_DEFAULTS, FILTER_LABELS, type FilterId, type FilterParams } from "@/lib/filters";

interface Props {
  sourceCanvas: HTMLCanvasElement;
  /** Optional selection mask (single-channel 0..255) confining the effect. */
  selectionMask?: Uint8ClampedArray;
  onCancel: () => void;
  onApply: (filtered: HTMLCanvasElement) => void;
}

export function FiltersModal({ sourceCanvas, selectionMask, onCancel, onApply }: Props) {
  const [filter, setFilter] = useState<FilterId>("brightness-contrast");
  const [params, setParams] = useState<FilterParams>({ ...FILTER_DEFAULTS });
  const previewRef = useRef<HTMLCanvasElement>(null);
  const previewSrc = useMemo(() => makePreview(sourceCanvas, 320), [sourceCanvas]);

  useEffect(() => {
    const c = previewRef.current; if (!c) return;
    const out = applyFilter(previewSrc, filter, params, scaleMask(selectionMask, sourceCanvas.width, sourceCanvas.height, previewSrc.width, previewSrc.height));
    c.width = out.width; c.height = out.height;
    c.getContext("2d")!.drawImage(out, 0, 0);
  }, [filter, params, previewSrc, selectionMask, sourceCanvas.width, sourceCanvas.height]);

  function commit() {
    const out = applyFilter(sourceCanvas, filter, params, selectionMask);
    onApply(out);
  }

  const Filters: FilterId[] = ["brightness-contrast", "hsl", "invert", "threshold", "blur", "sharpen", "grayscale"];

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur grid place-items-center p-3">
      <div className="w-full max-w-2xl bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <header className="flex items-center px-4 py-3 border-b border-border">
          <h3 className="font-bold text-sm">Filters & Adjustments</h3>
          {selectionMask && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary">selection only</span>}
          <button onClick={onCancel} className="ml-auto p-1 hover:bg-muted rounded"><X size={16} /></button>
        </header>
        <div className="grid md:grid-cols-2 gap-0">
          <div className="p-3 bg-muted/30 grid place-items-center min-h-[260px]">
            <canvas ref={previewRef} className="max-w-full max-h-[280px] rounded shadow border border-border bg-white" />
          </div>
          <div className="p-3 text-xs space-y-2.5">
            <div className="grid grid-cols-2 gap-1">
              {Filters.map(f => (
                <button key={f} onClick={() => setFilter(f)} className={`py-1.5 rounded text-[11px] font-semibold ${filter === f ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                  {FILTER_LABELS[f]}
                </button>
              ))}
            </div>
            <div className="pt-2 border-t border-border space-y-2">
              {filter === "brightness-contrast" && (
                <>
                  <FSlider label="Brightness" v={params.brightness} min={-100} max={100} onChange={(v) => setParams(p => ({ ...p, brightness: v }))} />
                  <FSlider label="Contrast"   v={params.contrast}   min={-100} max={100} onChange={(v) => setParams(p => ({ ...p, contrast: v }))} />
                </>
              )}
              {filter === "hsl" && (
                <>
                  <FSlider label="Hue"        v={params.hue}        min={-180} max={180} onChange={(v) => setParams(p => ({ ...p, hue: v }))} />
                  <FSlider label="Saturation" v={params.saturation} min={-100} max={100} onChange={(v) => setParams(p => ({ ...p, saturation: v }))} />
                  <FSlider label="Lightness"  v={params.lightness}  min={-100} max={100} onChange={(v) => setParams(p => ({ ...p, lightness: v }))} />
                </>
              )}
              {filter === "threshold" && (
                <FSlider label="Threshold" v={params.threshold} min={0} max={255} onChange={(v) => setParams(p => ({ ...p, threshold: v }))} />
              )}
              {filter === "blur" && (
                <FSlider label="Radius (px)" v={params.blurRadius} min={0} max={40} step={0.5} onChange={(v) => setParams(p => ({ ...p, blurRadius: v }))} />
              )}
              {filter === "sharpen" && (
                <FSlider label="Amount" v={params.sharpenAmount} min={0} max={200} onChange={(v) => setParams(p => ({ ...p, sharpenAmount: v }))} />
              )}
              {(filter === "invert" || filter === "grayscale") && (
                <p className="text-muted-foreground text-[11px]">No parameters — preview shows the result.</p>
              )}
            </div>
          </div>
        </div>
        <footer className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded text-xs hover:bg-muted">Cancel</button>
          <button onClick={commit} className="px-3 py-1.5 rounded text-xs bg-gradient-primary text-primary-foreground font-semibold flex items-center gap-1.5">
            <Check size={12} /> Apply
          </button>
        </footer>
      </div>
    </div>
  );
}

function FSlider({ label, v, min, max, step = 1, onChange }: { label: string; v: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <label className="block">
      <div className="flex justify-between text-[10px] text-muted-foreground">
        <span>{label}</span><span className="tabular-nums">{Math.round(v * 10) / 10}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </label>
  );
}

function makePreview(src: HTMLCanvasElement, maxDim: number): HTMLCanvasElement {
  const r = Math.min(1, maxDim / Math.max(src.width, src.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(src.width * r));
  c.height = Math.max(1, Math.round(src.height * r));
  c.getContext("2d")!.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

function scaleMask(mask: Uint8ClampedArray | undefined, sw: number, sh: number, dw: number, dh: number): Uint8ClampedArray | undefined {
  if (!mask) return undefined;
  const out = new Uint8ClampedArray(dw * dh);
  for (let y = 0; y < dh; y++) {
    const sy = Math.floor((y / dh) * sh);
    for (let x = 0; x < dw; x++) {
      const sx = Math.floor((x / dw) * sw);
      out[y * dw + x] = mask[sy * sw + sx];
    }
  }
  return out;
}