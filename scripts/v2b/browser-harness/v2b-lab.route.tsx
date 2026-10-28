import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { V2Session } from "@/lib/classical-v2b/session";
import { DEFAULT_TUNING, tuningToOptions } from "@/lib/classical-v2b/tuning";
import { maskToPNG } from "@/lib/classical-v2b/download";

export const Route = createFileRoute("/v2b-lab")({ component: V2bLab });

declare global { interface Window { __v2b?: any } }

function V2bLab() {
  const [log, setLog] = useState<string[]>([]);
  useEffect(() => {
    window.__v2b = {
      async run(dataUrl: string, maxEdge = 700, scale = 2) {
        const out: any = { steps: [] };
        const session = new V2Session();
        try {
          const img = new Image(); img.src = dataUrl; await img.decode();
          const s = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
          const c = document.createElement("canvas"); c.width = w; c.height = h;
          const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0, w, h);
          const rgba = ctx.getImageData(0, 0, w, h).data;
          const t0 = performance.now();
          const p = await session.prepare(new Uint8ClampedArray(rgba), w, h); out.steps.push(["prepare", Math.round(performance.now() - t0), p.darkKeyed]);
          const r = await session.render(tuningToOptions(DEFAULT_TUNING, p.darkKeyed));
          out.steps.push(["render", Math.round(r.renderTime), r.strokeCount, r.ink.length === w * h]);
          out.renderId = r.id;
          // concurrent request must be rejected
          const busy = session.render({}); const busy2 = await session.render({}).then(() => "accepted", (e: Error) => e.message);
          await busy; out.concurrent = busy2;
          const r2 = await session.render(tuningToOptions(DEFAULT_TUNING, p.darkKeyed));
          // stale export must be rejected
          const stale = await session.export(r.id, { width: w * scale, height: h * scale, minimumHatchWidthPx: 1.5, minimumHatchRunPx: 2, hatchSupportThreshold: 0.5 }).then(() => "accepted", (e: Error) => e.message);
          out.staleExport = stale;
          const ex = await session.export(r2.id, { width: w * scale, height: h * scale, minimumHatchWidthPx: 1.5, minimumHatchRunPx: 2, hatchSupportThreshold: 0.5 });
          out.steps.push(["export", Math.round(ex.exportTime), ex.mask.length === w * h * scale * scale]);
          const blob = await maskToPNG(ex.mask, w * scale, h * scale);
          const buf = new Uint8Array(await blob.arrayBuffer());
          let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
          out.pngBase64 = btoa(bin); out.pngBytes = buf.length; out.dims = [w * scale, h * scale];
          // dispose while idle then reuse must reject
          session.dispose(); out.afterDispose = await session.render({}).then(() => "accepted", (e: Error) => e.message);
        } catch (e: any) { out.error = String(e?.message || e); try { session.dispose(); } catch {} }
        return out;
      },
      async disposeDuringWork(dataUrl: string) {
        const session = new V2Session();
        const img = new Image(); img.src = dataUrl; await img.decode();
        const w = 900, h = Math.round(900 * img.naturalHeight / img.naturalWidth);
        const c = document.createElement("canvas"); c.width = w; c.height = h; const ctx = c.getContext("2d")!; ctx.drawImage(img, 0, 0, w, h);
        const rgba = ctx.getImageData(0, 0, w, h).data;
        const pending = session.prepare(new Uint8ClampedArray(rgba), w, h).then(() => "completed", (e: Error) => e.message);
        setTimeout(() => session.dispose(), 150);
        return await pending;
      },
    };
    setLog(["ready"]);
  }, []);
  return <pre data-testid="v2b-lab">{log.join("\n")}</pre>;
}
