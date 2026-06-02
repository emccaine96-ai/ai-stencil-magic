import { useEffect, useRef, useState } from "react";
import { Play, Pause, Plus, Trash2, Copy, Download, Film } from "lucide-react";
import type { AnimationData, Frame } from "@/lib/animation";
import { exportGif } from "@/lib/animation";

export function Timeline({
  anim,
  onChange,
  onSelectFrame,
  onCaptureCurrent,
  composedCanvas,
  renderFrameTo,
  onionSkin,
  setOnionSkin,
}: {
  anim: AnimationData;
  onChange: (a: AnimationData) => void;
  onSelectFrame: (frame: Frame) => void;
  onCaptureCurrent: () => { thumbnail: string; state: string };
  composedCanvas: HTMLCanvasElement | null;
  renderFrameTo: (frame: Frame, target: HTMLCanvasElement) => Promise<void>;
  onionSkin: number;
  setOnionSkin: (n: number) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const playRef = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!playing || anim.frames.length < 2) return;
    const interval = 1000 / Math.max(1, anim.fps);
    let idx = Math.max(0, anim.frames.findIndex(f => f.id === anim.activeFrameId));
    playRef.current = window.setInterval(() => {
      idx = (idx + 1) % anim.frames.length;
      const f = anim.frames[idx];
      onChange({ ...anim, activeFrameId: f.id });
      onSelectFrame(f);
      if (!anim.loop && idx === anim.frames.length - 1) setPlaying(false);
    }, interval);
    return () => { if (playRef.current) clearInterval(playRef.current); };
  }, [playing, anim, onChange, onSelectFrame]);

  function addFrame() {
    const cap = onCaptureCurrent();
    const f: Frame = { id: crypto.randomUUID(), name: `Frame ${anim.frames.length + 1}`, thumbnail: cap.thumbnail, state: cap.state, duration: 1000 / anim.fps };
    onChange({ ...anim, frames: [...anim.frames, f], activeFrameId: f.id });
  }
  function duplicateFrame(id: string) {
    const i = anim.frames.findIndex(f => f.id === id); if (i < 0) return;
    const src = anim.frames[i];
    const f: Frame = { ...src, id: crypto.randomUUID(), name: `${src.name} copy` };
    const next = [...anim.frames]; next.splice(i + 1, 0, f);
    onChange({ ...anim, frames: next, activeFrameId: f.id });
  }
  function deleteFrame(id: string) {
    const next = anim.frames.filter(f => f.id !== id);
    onChange({ ...anim, frames: next, activeFrameId: next[0]?.id ?? null });
  }

  async function doExport() {
    if (!anim.frames.length || !composedCanvas) return;
    setBusy(true);
    try {
      const w = Math.min(512, composedCanvas.width);
      const h = Math.round(composedCanvas.height * (w / composedCanvas.width));
      const buf: { canvas: HTMLCanvasElement; duration: number }[] = [];
      for (const fr of anim.frames) {
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const tmp = document.createElement("canvas"); tmp.width = composedCanvas.width; tmp.height = composedCanvas.height;
        await renderFrameTo(fr, tmp);
        c.getContext("2d")!.drawImage(tmp, 0, 0, w, h);
        buf.push({ canvas: c, duration: fr.duration });
      }
      const blob = await exportGif(buf);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "animation.gif"; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally { setBusy(false); }
  }

  return (
    <div className="border-t border-border bg-card/60 backdrop-blur px-2 py-2 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-xs">
        <Film size={13} className="text-primary" />
        <button onClick={() => setPlaying(p => !p)} disabled={anim.frames.length < 2} className="p-1 rounded hover:bg-muted disabled:opacity-50" aria-label="Play">
          {playing ? <Pause size={13} /> : <Play size={13} />}
        </button>
        <button onClick={addFrame} className="p-1 rounded hover:bg-muted" aria-label="Add frame"><Plus size={13} /></button>
        <label className="flex items-center gap-1">FPS
          <input type="number" min={1} max={60} value={anim.fps}
            onChange={(e) => onChange({ ...anim, fps: Math.max(1, Math.min(60, Number(e.target.value) || 12)) })}
            className="w-12 px-1 py-0.5 bg-background border border-border rounded text-xs" />
        </label>
        <label className="flex items-center gap-1">Onion
          <input type="range" min={0} max={3} value={onionSkin} onChange={(e) => setOnionSkin(Number(e.target.value))} />
        </label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={anim.loop} onChange={(e) => onChange({ ...anim, loop: e.target.checked })} />Loop</label>
        <div className="flex-1" />
        <button onClick={doExport} disabled={busy || anim.frames.length < 1} className="inline-flex items-center gap-1 px-2 py-1 rounded bg-primary text-primary-foreground disabled:opacity-50">
          <Download size={12} /> {busy ? "Exporting…" : "GIF"}
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {anim.frames.map((f, i) => (
          <div key={f.id} className={`relative shrink-0 w-16 h-16 rounded border ${f.id === anim.activeFrameId ? "border-primary ring-1 ring-primary" : "border-border"} bg-background overflow-hidden cursor-pointer group`}
            onClick={() => { onChange({ ...anim, activeFrameId: f.id }); onSelectFrame(f); }}>
            <img src={f.thumbnail} alt={f.name} className="w-full h-full object-contain" />
            <span className="absolute top-0 left-0 px-1 text-[9px] bg-black/60 text-white">{i + 1}</span>
            <div className="absolute bottom-0 right-0 hidden group-hover:flex gap-0.5">
              <button onClick={(e) => { e.stopPropagation(); duplicateFrame(f.id); }} className="p-0.5 bg-black/70 text-white hover:bg-primary"><Copy size={9} /></button>
              <button onClick={(e) => { e.stopPropagation(); deleteFrame(f.id); }} className="p-0.5 bg-black/70 text-white hover:bg-destructive"><Trash2 size={9} /></button>
            </div>
          </div>
        ))}
        {anim.frames.length === 0 && (
          <div className="text-[10px] text-muted-foreground italic">Click + to capture the current canvas as frame 1.</div>
        )}
      </div>
    </div>
  );
}