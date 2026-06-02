import { useState } from "react";
import { X, Download, Printer } from "lucide-react";
import { exportCanvas, exportTiledPrint, type ExportFormat } from "@/lib/exporters";

interface Props {
  canvas: HTMLCanvasElement;
  defaultName: string;
  onClose: () => void;
}

export function ExportModal({ canvas, defaultName, onClose }: Props) {
  const [tab, setTab] = useState<"single" | "tiled">("single");
  const [format, setFormat] = useState<ExportFormat>("png");
  const [name, setName] = useState(defaultName);
  const [quality, setQuality] = useState(92);
  const [busy, setBusy] = useState(false);

  // Tiled
  const [pageSize, setPageSize] = useState<"a4" | "letter">("letter");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const [targetWidthIn, setTargetWidthIn] = useState(8.5);
  const [marginIn, setMarginIn] = useState(0.3);
  const [overlapIn, setOverlapIn] = useState(0.25);
  const [crosshairs, setCrosshairs] = useState(true);

  async function run() {
    setBusy(true);
    try {
      if (tab === "single") {
        await exportCanvas(canvas, { format, filename: name, quality: quality / 100 });
      } else {
        await exportTiledPrint(canvas, {
          filename: name, pageSize, orientation,
          targetWidthIn, marginIn, overlapIn, crosshairs,
        });
      }
      onClose();
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur grid place-items-center p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-xl shadow-2xl overflow-hidden">
        <header className="flex items-center px-4 py-3 border-b border-border">
          <h3 className="font-bold text-sm">Export</h3>
          <button onClick={onClose} className="ml-auto p-1 hover:bg-muted rounded"><X size={16} /></button>
        </header>
        <div className="flex border-b border-border text-xs">
          <button onClick={() => setTab("single")} className={`flex-1 py-2 font-semibold flex items-center justify-center gap-1.5 ${tab === "single" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>
            <Download size={13} /> File
          </button>
          <button onClick={() => setTab("tiled")} className={`flex-1 py-2 font-semibold flex items-center justify-center gap-1.5 ${tab === "tiled" ? "text-primary border-b-2 border-primary" : "text-muted-foreground"}`}>
            <Printer size={13} /> Tiled Print
          </button>
        </div>

        <div className="p-4 space-y-3 text-xs">
          <label className="block">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Filename</span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5" />
          </label>

          {tab === "single" && (
            <>
              <label className="block">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Format</span>
                <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)} className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5">
                  <option value="png">PNG (white background)</option>
                  <option value="png-transparent">PNG (transparent)</option>
                  <option value="jpg">JPG</option>
                  <option value="pdf">PDF</option>
                  <option value="svg">SVG (embedded raster)</option>
                </select>
              </label>
              {format === "jpg" && (
                <label className="block">
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Quality {quality}%</span>
                  <input type="range" min={40} max={100} value={quality} onChange={(e) => setQuality(Number(e.target.value))} className="w-full accent-primary" />
                </label>
              )}
            </>
          )}

          {tab === "tiled" && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label>Page size
                  <select value={pageSize} onChange={(e) => setPageSize(e.target.value as "a4" | "letter")} className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5">
                    <option value="letter">US Letter</option>
                    <option value="a4">A4</option>
                  </select>
                </label>
                <label>Orientation
                  <select value={orientation} onChange={(e) => setOrientation(e.target.value as "portrait" | "landscape")} className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5">
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                  </select>
                </label>
              </div>
              <label>Stencil width (inches) — true print size
                <input type="number" min={1} max={120} step={0.5} value={targetWidthIn} onChange={(e) => setTargetWidthIn(Number(e.target.value))} className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label>Margin (in)
                  <input type="number" min={0} max={2} step={0.05} value={marginIn} onChange={(e) => setMarginIn(Number(e.target.value))} className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5" />
                </label>
                <label>Overlap (in)
                  <input type="number" min={0} max={2} step={0.05} value={overlapIn} onChange={(e) => setOverlapIn(Number(e.target.value))} className="w-full mt-1 bg-background border border-border rounded px-2 py-1.5" />
                </label>
              </div>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={crosshairs} onChange={(e) => setCrosshairs(e.target.checked)} />
                Crop marks &amp; tile labels
              </label>
            </>
          )}
        </div>

        <footer className="px-4 py-3 border-t border-border flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-xs hover:bg-muted">Cancel</button>
          <button onClick={run} disabled={busy} className="px-3 py-1.5 rounded text-xs bg-gradient-primary text-primary-foreground font-semibold flex items-center gap-1.5">
            {busy ? "Working…" : tab === "single" ? <><Download size={12} /> Export</> : <><Printer size={12} /> Build PDF</>}
          </button>
        </footer>
      </div>
    </div>
  );
}