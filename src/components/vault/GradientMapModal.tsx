import { useEffect, useMemo, useRef, useState } from "react";
import { X, Check } from "lucide-react";
import { GRADIENT_PRESETS, gradientMap, buildRampLUT, type Gradient } from "@/lib/canvas/gradient";

type Props = {
  source: ImageData | null;
  onApply: (g: Gradient, mix: number) => void;
  onClose: () => void;
};

function buildThumb(src: ImageData, maxDim = 320): ImageData | null {
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
  bc.drawImage(a, 0, 0, w, h);
  return bc.getImageData(0, 0, w, h);
}

function RampBar({ g }: { g: Gradient }) {
  const lut = useMemo(() => buildRampLUT(g), [g]);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    c.width = 256; c.height = 12;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const img = ctx.createImageData(256, 12);
    for (let x = 0; x < 256; x++) {
      for (let y = 0; y < 12; y++) {
        const i = (y * 256 + x) * 4;
        img.data[i] = lut[x * 4];
        img.data[i + 1] = lut[x * 4 + 1];
        img.data[i + 2] = lut[x * 4 + 2];
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [lut]);
  return <canvas ref={canvasRef} className="w-full h-3 rounded" />;
}

export function GradientMapModal({ source, onApply, onClose }: Props) {
  const [selId, setSelId] = useState<string>(GRADIENT_PRESETS[1].id);
  const [mix, setMix] = useState(1);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const thumb = useMemo(() => (source ? buildThumb(source, 320) : null), [source]);
  const preset = GRADIENT_PRESETS.find((p) => p.id === selId) ?? GRADIENT_PRESETS[0];

  useEffect(() => {
    const c = canvasRef.current; if (!c || !thumb) return;
    c.width = thumb.width; c.height = thumb.height;
    const ctx = c.getContext("2d"); if (!ctx) return;
    const clone = new ImageData(new Uint8ClampedArray(thumb.data), thumb.width, thumb.height);
    try { gradientMap(clone, preset.g, mix); } catch (e) { console.error("[gradmap]", e); }
    ctx.putImageData(clone, 0, 0);
  }, [thumb, preset, mix]);

  if (!source) return null;

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center"
      style={{ background: "rgba(13,13,15,0.75)", backdropFilter: "blur(8px)" }}>
      <div className="rounded-xl border border-white/10 bg-[#121216] w-[92vw] max-w-[520px] p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-sm font-bold">Gradient Map</div>
          <div className="ml-auto text-[11px] text-neutral-400">{preset.name} · {Math.round(mix * 100)}%</div>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10"><X size={14} /></button>
        </div>
        <div className="rounded-lg overflow-hidden bg-black/40 border border-white/5 flex items-center justify-center mb-3" style={{ minHeight: 160 }}>
          <canvas ref={canvasRef} className="block max-w-full max-h-[40vh]" />
        </div>
        <div className="grid grid-cols-3 gap-2 max-h-40 overflow-y-auto mb-3 pr-1">
          {GRADIENT_PRESETS.map((p) => (
            <button key={p.id}
              onClick={() => setSelId(p.id)}
              className={`rounded border p-1.5 text-left ${selId === p.id ? "border-[#A855F7] bg-white/5" : "border-white/10 hover:border-white/20"}`}>
              <RampBar g={p.g} />
              <div className="text-[10px] mt-1 truncate">{p.name}</div>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-3">
          <div className="text-[10px] text-neutral-400 w-10">Mix</div>
          <input type="range" min={0} max={1} step={0.05} value={mix}
            onChange={(e) => setMix(parseFloat(e.target.value))}
            className="flex-1 accent-[#A855F7]" />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded bg-white/5 hover:bg-white/10 text-xs py-2">Cancel</button>
          <button
            onClick={() => onApply(preset.g, mix)}
            className="flex-1 rounded bg-gradient-to-r from-[#A855F7] to-[#7c3aed] text-white text-xs font-bold py-2 flex items-center justify-center gap-1">
            <Check size={12} /> Apply
          </button>
        </div>
      </div>
    </div>
  );
}