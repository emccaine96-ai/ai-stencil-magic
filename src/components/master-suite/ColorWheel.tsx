import { useEffect, useRef, useState } from "react";
import { hslToRgb, rgbToHex, rgbToHsl, hexToRgb, mixRecipe } from "@/lib/ink-library";

type Harmony = "none" | "complementary" | "triadic" | "split" | "analogous";

export function ColorWheel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pick, setPick] = useState<string>("#A855F7");
  const [harmony, setHarmony] = useState<Harmony>("none");

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const size = 220;
    c.width = size; c.height = size;
    const ctx = c.getContext("2d")!;
    const r = size / 2;
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - r, dy = y - r;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const i = (y * size + x) * 4;
        if (dist > r) { img.data[i + 3] = 0; continue; }
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        const h = (angle + 360) % 360;
        const s = Math.min(100, (dist / r) * 100);
        const [rr, gg, bb] = hslToRgb(h, s, 50);
        img.data[i] = rr; img.data[i + 1] = gg; img.data[i + 2] = bb; img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    drawHarmony(ctx, pick, harmony, size);
  }, [pick, harmony]);

  function onClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * c.width;
    const y = ((e.clientY - rect.top) / rect.height) * c.height;
    const ctx = c.getContext("2d")!;
    const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    if (d[3] < 10) return;
    setPick(rgbToHex(d[0], d[1], d[2]));
  }

  const recipe = mixRecipe(pick);

  return (
    <div className="space-y-3 text-sm">
      <div className="flex gap-3 items-start">
        <canvas
          ref={canvasRef}
          onClick={onClick}
          className="rounded-full cursor-crosshair shrink-0"
          style={{ width: 180, height: 180 }}
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-10 w-10 rounded-xl border border-border shrink-0" style={{ background: pick }} />
            <div className="min-w-0">
              <div className="text-xs font-mono">{pick.toUpperCase()}</div>
              <input
                type="color"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className="h-6 w-full rounded border border-border bg-transparent cursor-pointer"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[10px]">
            {([
              ["none", "None"],
              ["complementary", "Complement"],
              ["triadic", "Triadic"],
              ["split", "Split-comp"],
              ["analogous", "Analogous"],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setHarmony(id as Harmony)}
                className={`py-1 px-2 rounded-full border ${harmony === id ? "border-primary bg-gradient-primary text-primary-foreground" : "border-border"}`}
              >{label}</button>
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-border p-3 bg-background/40">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Mix recipe</div>
        {recipe.length === 0 ? (
          <div className="text-xs text-muted-foreground">Pure pigment — no mixing required.</div>
        ) : (
          <ul className="space-y-1.5">
            {recipe.map((p, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <span className="h-4 w-4 rounded border border-border shrink-0" style={{ background: p.hex }} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="tabular-nums font-bold gradient-text">{p.pct}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function drawHarmony(ctx: CanvasRenderingContext2D, hex: string, harmony: Harmony, size: number) {
  if (harmony === "none") return;
  const [r, g, b] = hexToRgb(hex);
  const [h] = rgbToHsl(r, g, b);
  const angles: number[] = [h];
  if (harmony === "complementary") angles.push((h + 180) % 360);
  else if (harmony === "triadic") angles.push((h + 120) % 360, (h + 240) % 360);
  else if (harmony === "split") angles.push((h + 150) % 360, (h + 210) % 360);
  else if (harmony === "analogous") angles.push((h + 30) % 360, (h - 30 + 360) % 360);

  const cx = size / 2, cy = size / 2, R = size / 2 - 6;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.85)";
  ctx.lineWidth = 1.5;
  for (const a of angles) {
    const rad = (a * Math.PI) / 180;
    const x = cx + Math.cos(rad) * R;
    const y = cy + Math.sin(rad) * R;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}