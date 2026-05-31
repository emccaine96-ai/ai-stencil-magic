import { useEffect, useRef, useState } from "react";
import { Loader2, Download, Zap } from "lucide-react";

type Props = {
  photo: string | null;
  onReplace: (dataUrl: string) => void;
};

export function Upscaler({ photo, onReplace }: Props) {
  const [target, setTarget] = useState<2048 | 3840>(2048);
  const [progress, setProgress] = useState<number | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [resultSize, setResultSize] = useState<{ w: number; h: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => () => { workerRef.current?.terminate(); }, []);

  async function run() {
    if (!photo) return;
    setErr(null);
    setResultUrl(null);
    setProgress(0);
    try {
      const img = new Image();
      img.src = photo;
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const ratio = img.width / img.height;
      let dstW = target;
      let dstH = Math.round(target / ratio);
      if (ratio < 1) { dstH = target; dstW = Math.round(target * ratio); }
      // Cap so we never exceed ~3840x2160 area equivalent (memory safety).
      const maxArea = 3840 * 2160;
      if (dstW * dstH > maxArea) {
        const scale = Math.sqrt(maxArea / (dstW * dstH));
        dstW = Math.round(dstW * scale);
        dstH = Math.round(dstH * scale);
      }

      const src = document.createElement("canvas");
      src.width = img.width; src.height = img.height;
      const sctx = src.getContext("2d")!;
      sctx.drawImage(img, 0, 0);
      const srcData = sctx.getImageData(0, 0, img.width, img.height);

      const w = new Worker(new URL("../../lib/lanczos.worker.ts", import.meta.url), { type: "module" });
      workerRef.current = w;
      w.onmessage = (e: MessageEvent<{ type: string; p?: number; image?: ImageData }>) => {
        if (e.data.type === "progress") setProgress(Math.round((e.data.p ?? 0) * 100));
        if (e.data.type === "done" && e.data.image) {
          const out = document.createElement("canvas");
          out.width = e.data.image.width; out.height = e.data.image.height;
          out.getContext("2d")!.putImageData(e.data.image, 0, 0);
          const url = out.toDataURL("image/png");
          setResultUrl(url);
          setResultSize({ w: out.width, h: out.height });
          setProgress(100);
          w.terminate();
          workerRef.current = null;
        }
      };
      w.postMessage({ type: "resize", src: srcData, dstW, dstH });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upscale failed");
      setProgress(null);
    }
  }

  function download() {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `upscaled-${resultSize?.w ?? "img"}px.png`;
    a.click();
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-2">
        {[2048, 3840].map((s) => (
          <button
            key={s}
            onClick={() => setTarget(s as 2048 | 3840)}
            className={`py-2 rounded-xl text-xs font-bold border transition ${target === s ? "border-primary bg-gradient-primary text-primary-foreground" : "border-border hover:border-primary/50"}`}
          >
            {s === 3840 ? "4K (3840px)" : "2K (2048px)"}
          </button>
        ))}
      </div>
      <button
        onClick={run}
        disabled={!photo || (progress !== null && progress < 100)}
        className="w-full rounded-full bg-gradient-primary text-primary-foreground py-2.5 font-bold shadow-glow disabled:opacity-50 flex items-center justify-center gap-2 text-xs"
      >
        {progress !== null && progress < 100 ? <><Loader2 className="animate-spin" size={14} /> Upscaling {progress}%</> : <><Zap size={14} /> Run Lanczos-3 upscale</>}
      </button>
      {progress !== null && progress < 100 ? (
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-gradient-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      {resultUrl && resultSize ? (
        <div className="space-y-2">
          <div className="text-[11px] text-muted-foreground">Result: {resultSize.w}×{resultSize.h}px</div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={download} className="rounded-xl border border-border py-2 text-xs font-semibold hover:border-primary flex items-center justify-center gap-1"><Download size={12} /> Download</button>
            <button onClick={() => onReplace(resultUrl)} className="rounded-xl bg-gradient-primary text-primary-foreground py-2 text-xs font-semibold">Use as reference</button>
          </div>
        </div>
      ) : null}
      {err ? <div className="text-xs text-destructive">{err}</div> : null}
      <p className="text-[10px] text-muted-foreground">Lanczos-3 (3-lobe sinc) resampling in a Web Worker. Capped at 4K to stay within browser memory.</p>
    </div>
  );
}