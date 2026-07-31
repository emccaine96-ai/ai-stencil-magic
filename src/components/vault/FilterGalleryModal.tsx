import { useEffect, useMemo, useRef, useState } from "react";
import { X, Check } from "lucide-react";
import { FILTER_PRESETS, type FilterPreset } from "@/lib/canvas/filter-presets";
import { applyAdjustments } from "@/lib/canvas/adjustments";

type Props = {
  source: ImageData | null;
  onApply: (preset: FilterPreset) => void;
  onClose: () => void;
};

/** Build a small preview thumbnail (max 120px) from the source once. */
function buildThumbSource(src: ImageData, maxDim = 120): ImageData | null {
  const scale = Math.min(1, maxDim / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * scale));
  const h = Math.max(1, Math.round(src.height * scale));
  const a = document.createElement("canvas");
  a.width = src.width;
  a.height = src.height;
  const ac = a.getContext("2d");
  if (!ac) return null;
  ac.putImageData(src, 0, 0);
  const b = document.createElement("canvas");
  b.width = w;
  b.height = h;
  const bc = b.getContext("2d");
  if (!bc) return null;
  bc.imageSmoothingEnabled = true;
  bc.drawImage(a, 0, 0, w, h);
  return bc.getImageData(0, 0, w, h);
}

function ThumbTile({
  src,
  preset,
  active,
  onPick,
}: {
  src: ImageData;
  preset: FilterPreset;
  active: boolean;
  onPick: () => void;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const clone = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
    applyAdjustments(clone, preset.values);
    ctx.putImageData(clone, 0, 0);
  }, [src, preset]);
  return (
    <button
      onClick={onPick}
      className={`relative flex flex-col items-center gap-1 rounded-lg overflow-hidden border ${active ? "border-[#A855F7] ring-1 ring-[#A855F7]" : "border-white/10"} bg-black/40 hover:bg-white/5 p-1`}
    >
      <canvas
        ref={ref}
        className="block w-full h-auto rounded"
        style={{ imageRendering: "auto" }}
      />
      <div className="text-[10px] text-neutral-300 pb-0.5 truncate w-full text-center">
        {preset.name}
      </div>
      {active && (
        <div className="absolute top-1 right-1 bg-[#A855F7] rounded-full p-0.5">
          <Check size={10} />
        </div>
      )}
    </button>
  );
}

export function FilterGalleryModal({ source, onApply, onClose }: Props) {
  const thumb = useMemo(() => (source ? buildThumbSource(source, 120) : null), [source]);
  const [selected, setSelected] = useState<string>("original");
  if (!source || !thumb) return null;
  return (
    <div
      className="absolute inset-0 z-[60] flex items-center justify-center"
      style={{ background: "rgba(13,13,15,0.75)", backdropFilter: "blur(8px)" }}
    >
      <div className="rounded-xl border border-white/10 bg-[#121216] w-[92vw] max-w-[560px] p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-sm font-bold">Filter Gallery</div>
          <div className="ml-auto">
            <button onClick={onClose} className="p-1 rounded hover:bg-white/10">
              <X size={14} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {FILTER_PRESETS.map((p) => (
            <ThumbTile
              key={p.id}
              src={thumb}
              preset={p}
              active={selected === p.id}
              onPick={() => setSelected(p.id)}
            />
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={onClose}
            className="flex-1 rounded bg-white/5 hover:bg-white/10 text-xs py-2"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const p = FILTER_PRESETS.find((x) => x.id === selected) ?? FILTER_PRESETS[0];
              onApply(p);
            }}
            className="flex-1 rounded bg-gradient-to-r from-[#A855F7] to-[#7c3aed] text-white text-xs font-bold py-2"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
