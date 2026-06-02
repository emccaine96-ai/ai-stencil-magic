import { useEffect, useRef, useState } from "react";
import { X, Image as ImageIcon, Upload, Eye, EyeOff } from "lucide-react";

interface Props {
  src: string | null;
  onSrcChange: (s: string | null) => void;
  onClose: () => void;
}

export function ReferencePanel({ src, onSrcChange, onClose }: Props) {
  const [pos, setPos] = useState({ x: 16, y: 80 });
  const [size, setSize] = useState({ w: 220, h: 220 });
  const [opacity, setOpacity] = useState(1);
  const [visible, setVisible] = useState(true);
  const dragRef = useRef<{ mode: "move" | "resize"; sx: number; sy: number; px: number; py: number; pw: number; ph: number } | null>(null);

  function onPointerMove(e: PointerEvent) {
    const d = dragRef.current; if (!d) return;
    if (d.mode === "move") {
      setPos({ x: Math.max(0, d.px + e.clientX - d.sx), y: Math.max(0, d.py + e.clientY - d.sy) });
    } else {
      setSize({
        w: Math.max(120, d.pw + e.clientX - d.sx),
        h: Math.max(120, d.ph + e.clientY - d.sy),
      });
    }
  }
  function onPointerUp() {
    dragRef.current = null;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }
  function startDrag(e: React.PointerEvent, mode: "move" | "resize") {
    dragRef.current = { mode, sx: e.clientX, sy: e.clientY, px: pos.x, py: pos.y, pw: size.w, ph: size.h };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }
  useEffect(() => () => {
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  }, []);

  function pickFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onSrcChange(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div
      className="fixed z-40 rounded-lg border border-border bg-card/95 backdrop-blur shadow-2xl overflow-hidden flex flex-col"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h }}
    >
      <div
        className="h-7 bg-muted/70 flex items-center px-2 gap-1 text-[11px] font-semibold cursor-move select-none"
        onPointerDown={(e) => startDrag(e, "move")}
      >
        <ImageIcon size={12} /> Reference
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setVisible(v => !v)} className="p-0.5 hover:bg-background/50 rounded">
            {visible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
          <button onClick={onClose} className="p-0.5 hover:bg-background/50 rounded"><X size={12} /></button>
        </div>
      </div>
      <div className="flex-1 relative bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:14px_14px] grid place-items-center overflow-hidden">
        {src && visible ? (
          <img src={src} alt="Reference" className="max-w-full max-h-full object-contain pointer-events-none" style={{ opacity }} />
        ) : (
          <label className="text-[11px] text-muted-foreground flex flex-col items-center gap-1 cursor-pointer p-3 text-center">
            <Upload size={18} />
            <span>Tap to upload reference</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
          </label>
        )}
      </div>
      {src && (
        <div className="px-2 py-1.5 bg-card/95 border-t border-border flex items-center gap-2 text-[10px]">
          <span>Opacity</span>
          <input type="range" min={10} max={100} value={Math.round(opacity * 100)}
                 onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                 className="flex-1 accent-primary" />
          <button onClick={() => onSrcChange(null)} className="text-destructive">Clear</button>
        </div>
      )}
      <div
        className="absolute bottom-0 right-0 w-3.5 h-3.5 cursor-nwse-resize bg-primary/40"
        onPointerDown={(e) => startDrag(e, "resize")}
      />
    </div>
  );
}