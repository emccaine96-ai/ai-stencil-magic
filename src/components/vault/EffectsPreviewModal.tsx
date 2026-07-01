import { useEffect, useMemo, useRef, useState } from "react";
import { X, Check } from "lucide-react";
import * as FX from "@/lib/canvas/effects";

export type EffectPreviewConfig = {
  name: string;
  /** Apply to a mutable ImageData with a single numeric amount. */
  apply: (img: ImageData, amount: number) => void;
  min: number;
  max: number;
  step: number;
  default: number;
  unit?: string;
};

/** Registry of previewable single-slider effects backed by the effects engine. */
export const EFFECT_PRESETS: Record<string, EffectPreviewConfig> = {
  blur:     { name: "Gaussian Blur", apply: (i, a) => { FX.gaussianBlur(i, a); },              min: 1, max: 30, step: 1, default: 6, unit: "px" },
  sharpen:  { name: "Sharpen",       apply: (i, a) => { FX.unsharpMask(i, 2, a, 0); },         min: 0, max: 3,  step: 0.1, default: 1, unit: "×" },
  vignette: { name: "Vignette",      apply: (i, a) => { FX.vignette(i, a, 0.7, 0.5); },        min: 0, max: 1,  step: 0.05, default: 0.6, unit: "" },
  pixelate: { name: "Pixelate",      apply: (i, a) => { FX.pixelate(i, a); },                  min: 2, max: 60, step: 1, default: 14, unit: "px" },
  edge:     { name: "Edge Detect",   apply: (i) => { FX.edgeDetect(i); },                      min: 0, max: 1,  step: 1, default: 0, unit: "" },
  noise:    { name: "Noise",         apply: (i, a) => { FX.noise(i, a, true); },               min: 0, max: 80, step: 1, default: 24, unit: "" },
  glow:     { name: "Glow",          apply: (i, a) => { FX.glow(i, 12, a, 128); },             min: 0, max: 1.5, step: 0.05, default: 0.6, unit: "" },
  chromatic:{ name: "Chromatic",     apply: (i, a) => { FX.chromaticAberration(i, a); },       min: 0, max: 24, step: 1, default: 6, unit: "px" },
};

type Props = {
  source: ImageData | null;
  preset: EffectPreviewConfig | null;
  onApply: (amount: number) => void;
  onClose: () => void;
};

function buildThumb(src: ImageData, maxDim = 360): ImageData | null {
  const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const a = document.createElement("canvas");
  a.width = src.width; a.height = src.height;
  const ac = a.getContext("2d"); if (!ac) return null;
  ac.putImageData(src, 0, 0);
  const b = document.createElement("canvas");
  b.width = w; b.height = h;
  const bc = b.getContext("2d"); if (!bc) return null;
  bc.imageSmoothingEnabled = true;
  bc.drawImage(a, 0, 0, w, h);
  return bc.getImageData(0, 0, w, h);
}

export function EffectsPreviewModal({ source, preset, onApply, onClose }: Props) {
  const [amount, setAmount] = useState<number>(preset?.default ?? 0);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thumb = useMemo(() => (source ? buildThumb(source, 360) : null), [source]);

  useEffect(() => { setAmount(preset?.default ?? 0); }, [preset]);

  useEffect(() => {
    const c = canvasRef.current; if (!c || !thumb || !preset) return;
    c.width = thumb.width; c.height = thumb.height;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const clone = new ImageData(new Uint8ClampedArray(thumb.data), thumb.width, thumb.height);
    try { preset.apply(clone, amount); } catch (e) { console.error("[fx-preview]", e); }
    ctx.putImageData(clone, 0, 0);
  }, [thumb, preset, amount]);

  if (!source || !preset) return null;

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center"
      style={{ background: "rgba(13,13,15,0.75)", backdropFilter: "blur(8px)" }}>
      <div className="rounded-xl border border-white/10 bg-[#121216] w-[92vw] max-w-[480px] p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-sm font-bold">{preset.name}</div>
          <div className="ml-auto text-[11px] text-neutral-400 tabular-nums">
            {amount.toFixed(preset.step < 1 ? 2 : 0)}{preset.unit ?? ""}
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={14} /></button>
        </div>
        <div className="rounded-lg overflow-hidden bg-black/40 border border-white/5 flex items-center justify-center mb-3" style={{ minHeight: 180 }}>
          <canvas ref={canvasRef} className="block max-w-full max-h-[45vh]" />
        </div>
        {preset.max > preset.min && (
          <input
            type="range"
            min={preset.min} max={preset.max} step={preset.step}
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value))}
            className="w-full accent-[#A855F7]"
          />
        )}
        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 rounded bg-white/5 hover:bg-white/10 text-xs py-2">Cancel</button>
          <button
            onClick={() => onApply(amount)}
            className="flex-1 rounded bg-gradient-to-r from-[#A855F7] to-[#7c3aed] text-white text-xs font-bold py-2 flex items-center justify-center gap-1">
            <Check size={12} /> Apply
          </button>
        </div>
      </div>
    </div>
  );
}