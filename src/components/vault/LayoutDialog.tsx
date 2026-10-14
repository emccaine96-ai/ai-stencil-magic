import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { centeredAspectRect, clampRect, type CropRect } from "@/lib/vault-ops/layout-ops";

export type LayoutKind = "crop" | "resize" | "border" | "frame";

export type LayoutResult =
  | { kind: "crop"; rect: CropRect }
  | { kind: "resize"; width: number; height: number }
  | { kind: "border"; thickness: number; color: string }
  | { kind: "frame"; radius: number; thickness: number; color: string };

type Props = {
  kind: LayoutKind;
  width: number;
  height: number;
  onApply: (r: LayoutResult) => void;
  onClose: () => void;
};

const TITLES: Record<LayoutKind, string> = {
  crop: "Crop",
  resize: "Resize",
  border: "Border",
  frame: "Frame",
};

const MAX_SIDE = 8192;

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] text-white/60">
      {label}
      <input
        type="number"
        inputMode="numeric"
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white"
      />
    </label>
  );
}

export function LayoutDialog({ kind, width, height, onApply, onClose }: Props) {
  const [rect, setRect] = useState<CropRect>({ x: 0, y: 0, w: width, h: height });
  const [rw, setRw] = useState(width);
  const [rh, setRh] = useState(height);
  const [lock, setLock] = useState(true);
  const [thickness, setThickness] = useState(Math.max(4, Math.round(Math.min(width, height) * 0.03)));
  const [radius, setRadius] = useState(Math.round(Math.min(width, height) * 0.08));
  const [color, setColor] = useState("#0d0d0f");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ratio = width / height;
  const cropFinal = clampRect(rect, width, height);
  const outW = kind === "crop" ? cropFinal.w : kind === "resize" ? Math.min(MAX_SIDE, Math.max(1, Math.round(rw))) : width;
  const outH = kind === "crop" ? cropFinal.h : kind === "resize" ? Math.min(MAX_SIDE, Math.max(1, Math.round(rh))) : height;
  const tooBig = kind === "resize" && (rw > MAX_SIDE || rh > MAX_SIDE);

  const apply = () => {
    if (kind === "crop") onApply({ kind, rect: cropFinal });
    else if (kind === "resize") onApply({ kind, width: outW, height: outH });
    else if (kind === "border") onApply({ kind, thickness, color });
    else onApply({ kind, radius, thickness, color });
  };

  return (
    <div
      role="dialog"
      aria-label={TITLES[kind]}
      className="absolute inset-0 z-[60] flex items-center justify-center"
      style={{ background: "rgba(13,13,15,0.75)", backdropFilter: "blur(8px)" }}
    >
      <div className="rounded-xl border border-white/10 bg-[#121216] w-[92vw] max-w-[420px] p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="text-sm font-bold">{TITLES[kind]}</div>
          <button onClick={onClose} aria-label="Close" className="ml-auto p-1 rounded hover:bg-white/10">
            <X size={14} />
          </button>
        </div>

        {kind === "crop" && (
          <>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {(
                [
                  ["Full", null],
                  ["1:1", 1],
                  ["4:5", 4 / 5],
                  ["3:4", 3 / 4],
                  ["16:9", 16 / 9],
                ] as const
              ).map(([name, a]) => (
                <button
                  key={name}
                  onClick={() => setRect(a ? centeredAspectRect(width, height, a) : { x: 0, y: 0, w: width, h: height })}
                  className="px-2.5 py-1 rounded-full text-[11px] bg-white/5 hover:bg-white/10 border border-white/10"
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Left (px)" value={rect.x} onChange={(n) => setRect({ ...rect, x: n })} max={width - 1} />
              <NumberField label="Top (px)" value={rect.y} onChange={(n) => setRect({ ...rect, y: n })} max={height - 1} />
              <NumberField label="Width (px)" value={rect.w} onChange={(n) => setRect({ ...rect, w: n })} min={1} max={width} />
              <NumberField label="Height (px)" value={rect.h} onChange={(n) => setRect({ ...rect, h: n })} min={1} max={height} />
            </div>
          </>
        )}

        {kind === "resize" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="Width (px)"
                value={rw}
                min={1}
                max={MAX_SIDE}
                onChange={(n) => {
                  setRw(n);
                  if (lock) setRh(Math.max(1, Math.round(n / ratio)));
                }}
              />
              <NumberField
                label="Height (px)"
                value={rh}
                min={1}
                max={MAX_SIDE}
                onChange={(n) => {
                  setRh(n);
                  if (lock) setRw(Math.max(1, Math.round(n * ratio)));
                }}
              />
            </div>
            <label className="flex items-center gap-2 mt-3 text-xs text-white/70">
              <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} />
              Keep aspect ratio
            </label>
            <div className="flex gap-1.5 mt-2">
              {[0.5, 2].map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setRw(Math.round(width * f));
                    setRh(Math.round(height * f));
                  }}
                  className="px-2.5 py-1 rounded-full text-[11px] bg-white/5 hover:bg-white/10 border border-white/10"
                >
                  {f === 0.5 ? "Half" : "Double"}
                </button>
              ))}
            </div>
          </>
        )}

        {(kind === "border" || kind === "frame") && (
          <div className="grid grid-cols-2 gap-2">
            {kind === "frame" && (
              <NumberField label="Corner radius (px)" value={radius} onChange={setRadius} max={Math.floor(Math.min(width, height) / 2)} />
            )}
            <NumberField
              label={kind === "frame" ? "Outline (px, 0 = none)" : "Thickness (px)"}
              value={thickness}
              onChange={(n) => setThickness(kind === "frame" ? Math.max(0, n) : Math.max(1, n))}
              max={Math.floor(Math.min(width, height) / 2)}
            />
            <label className="flex flex-col gap-1 text-[10px] text-white/60">
              Colour
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                aria-label="Colour"
                className="h-9 w-full rounded bg-white/5 border border-white/10"
              />
            </label>
          </div>
        )}

        <div className="mt-3 text-[11px] text-white/50">
          {kind === "border" || kind === "frame" ? (
            <>Size stays {width}×{height}px</>
          ) : (
            <>
              {width}×{height} → <span className="text-white">{outW}×{outH}</span> px
            </>
          )}
          {tooBig && <span className="text-amber-400"> (capped at {MAX_SIDE}px)</span>}
        </div>

        <div className="flex gap-2 mt-3">
          <button onClick={onClose} className="flex-1 rounded bg-white/5 hover:bg-white/10 text-xs py-2">
            Cancel
          </button>
          <button
            onClick={apply}
            className="flex-1 rounded bg-gradient-to-r from-[#00F5D4] to-[#00B8A9] text-black text-xs font-bold py-2"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
