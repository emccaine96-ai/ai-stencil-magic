import { useEffect, useState } from "react";
import { Loader2, Droplet } from "lucide-react";
import { kmeansColors, nearestInk, rgbToHex } from "@/lib/ink-library";

type Match = { hex: string; brand: string; name: string; inkHex: string; deltaE: number; share: number };

export function InkInventory({ photo }: { photo: string | null }) {
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [k, setK] = useState<5 | 7 | 10>(7);

  useEffect(() => {
    setMatches(null);
  }, [photo]);

  async function analyze() {
    if (!photo) return;
    setLoading(true);
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = photo;
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const W = Math.min(img.width, 320);
      const H = Math.round((W / img.width) * img.height);
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0, W, H);
      const data = ctx.getImageData(0, 0, W, H);
      const clusters = kmeansColors(data, k);
      const total = clusters.reduce((a, b) => a + b.count, 0) || 1;
      const out: Match[] = clusters.map((c) => {
        const m = nearestInk(c.r, c.g, c.b);
        return {
          hex: rgbToHex(c.r, c.g, c.b),
          brand: m.ink.brand,
          name: m.ink.name,
          inkHex: m.ink.hex,
          deltaE: m.deltaE,
          share: c.count / total,
        };
      });
      setMatches(out);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-2">
        <div className="flex rounded-full border border-border p-0.5 text-[10px]">
          {([5, 7, 10] as const).map((n) => (
            <button
              key={n}
              onClick={() => setK(n)}
              className={`px-2.5 py-1 rounded-full ${k === n ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground"}`}
            >{n} colors</button>
          ))}
        </div>
        <button
          onClick={analyze}
          disabled={!photo || loading}
          className="flex-1 rounded-full bg-gradient-primary text-primary-foreground py-2 text-xs font-bold shadow-glow disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {loading ? <><Loader2 className="animate-spin" size={12} /> Analyzing…</> : <><Droplet size={12} /> Extract palette</>}
        </button>
      </div>
      {matches ? (
        <ul className="space-y-2">
          {matches.map((m, i) => (
            <li key={i} className="flex items-center gap-3 p-2 rounded-xl border border-border bg-background/40">
              <div className="relative h-9 w-9 shrink-0">
                <div className="absolute inset-0 rounded-full border border-border" style={{ background: m.inkHex }} />
                <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full border border-border" style={{ background: m.hex }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">{m.brand} — {m.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">{m.inkHex.toUpperCase()} · ΔE {m.deltaE.toFixed(1)}</div>
              </div>
              <div className="text-[10px] text-muted-foreground tabular-nums">{(m.share * 100).toFixed(0)}%</div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[10px] text-muted-foreground">Runs k-means++ on your uploaded photo, then matches each cluster to the closest real ink (Solid Ink / Eternal / Fusion / Intenze) by CIEDE2000.</p>
      )}
    </div>
  );
}