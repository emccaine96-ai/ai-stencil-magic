/**
 * Retouch Studio — ExportSheet (handoff pieces 2 + 3).
 *
 * One sheet for everything that gets a finished stencil out of Retouch Studio:
 * Save to Vault, Download PNG, and true-size Print. Each action is a direct
 * port of the matching function in src/routes/touch-up.tsx (saveToVault,
 * downloadPNG/exportCanvas, handlePrint) using the same shared libs
 * (@/lib/vault saveStencil, @/lib/touch-up/print). No new export format and
 * no new destination.
 *
 * Mirror is a draw-time transform only: the edited canvas is never mutated.
 * The top-bar Print button opens this same sheet (print is one action in it,
 * as the handoff suggests) rather than being its own flow.
 */
import { useState } from "react";
import { toast } from "sonner";
import {
  PAPER_SIZES,
  composePrintCanvas,
  inchesToMm,
  pixelsToInches,
  printCanvas,
} from "@/lib/touch-up/print";
import { saveStencil } from "@/lib/vault";
import { RetouchSheet } from "./RetouchSheet";

export interface ExportSheetProps {
  /** Returns the live edited canvas, or null if nothing is loaded. */
  getCanvas: () => HTMLCanvasElement | null;
  /** Source photo for the Vault record (null when the session has none). */
  photo: string | null;
  onClose: () => void;
}

export function ExportSheet({ getCanvas, photo, onClose }: ExportSheetProps) {
  const [dpi, setDpi] = useState(300);
  const [paperId, setPaperId] = useState("letter");
  const [mirror, setMirror] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const canvas = getCanvas();
  const paper = PAPER_SIZES.find((p) => p.id === paperId) ?? PAPER_SIZES[0];
  const physicalIn = canvas ? { w: pixelsToInches(canvas.width, dpi), h: pixelsToInches(canvas.height, dpi) } : null;

  /** Same as touch-up.tsx exportCanvas(): flatten, optionally mirrored, without touching the source. */
  function exportCanvas(mirrored: boolean): HTMLCanvasElement | null {
    const edit = getCanvas();
    if (!edit) return null;
    const out = document.createElement("canvas");
    out.width = edit.width;
    out.height = edit.height;
    const octx = out.getContext("2d");
    if (!octx) return null;
    if (mirrored) {
      octx.translate(out.width, 0);
      octx.scale(-1, 1);
    }
    octx.drawImage(edit, 0, 0);
    return out;
  }

  async function handleSave() {
    const edit = getCanvas();
    if (!edit) return;
    setSaveState("saving");
    try {
      await saveStencil({
        stencil: edit.toDataURL("image/png"),
        photo,
        style: "touch-up",
        meta: { source: "retouch-studio" },
      });
      setSaveState("saved");
      toast.success("Saved to your Vault");
      setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
      toast.error("Could not save — try again");
      setTimeout(() => setSaveState("idle"), 2500);
    }
  }

  function handleDownload() {
    const out = exportCanvas(mirror);
    if (!out) return;
    const a = document.createElement("a");
    a.href = out.toDataURL("image/png");
    a.download = "retouched-stencil.png";
    a.click();
  }

  function handlePrint() {
    const edit = getCanvas();
    if (!edit) return;
    const page = composePrintCanvas(edit, edit.width, edit.height, { dpi, paper, mirror });
    printCanvas(page, "Retouched stencil");
  }

  return (
    <RetouchSheet title="Save, export & print" onClose={onClose}>
      {!canvas ? (
        <p className="text-[11px] text-destructive">No stencil is loaded yet, so there is nothing to export.</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-white/60">
          DPI
          <input
            type="number"
            value={dpi}
            onChange={(e) => setDpi(Number(e.target.value) || 300)}
            className="mt-1 w-full bg-black/50 border border-white/15 rounded-lg px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="text-xs text-white/60">
          Paper
          <select
            value={paperId}
            onChange={(e) => setPaperId(e.target.value)}
            className="mt-1 w-full bg-black/50 border border-white/15 rounded-lg px-2 py-1 text-sm text-white"
          >
            {PAPER_SIZES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {physicalIn ? (
        <p className="text-[11px] text-white/50">
          Stencil {physicalIn.w.toFixed(2)} in × {physicalIn.h.toFixed(2)} in ({inchesToMm(physicalIn.w).toFixed(0)} mm
          × {inchesToMm(physicalIn.h).toFixed(0)} mm) at {dpi} DPI · {paper.name} is {paper.widthIn.toFixed(2)} in ×{" "}
          {paper.heightIn.toFixed(2)} in
        </p>
      ) : null}
      <label className="flex items-center gap-2 text-xs text-white/60">
        <input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Mirror for transfer
        (print/export only)
      </label>
      <button
        onClick={handleSave}
        disabled={!canvas || saveState === "saving"}
        className="w-full rounded-xl bg-gradient-primary text-primary-foreground py-2.5 text-xs font-bold disabled:opacity-50"
      >
        {saveState === "saving"
          ? "Saving…"
          : saveState === "saved"
            ? "Saved to Vault"
            : saveState === "error"
              ? "Save failed — retry"
              : "Save to Vault"}
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={handlePrint}
          disabled={!canvas}
          className="rounded-xl border border-white/15 py-2 text-xs font-semibold hover:border-primary disabled:opacity-50"
        >
          Print on {paper.name}
        </button>
        <button
          onClick={handleDownload}
          disabled={!canvas}
          className="rounded-xl border border-white/15 py-2 text-xs font-semibold hover:border-primary disabled:opacity-50"
        >
          Download PNG
        </button>
      </div>
    </RetouchSheet>
  );
}

export default ExportSheet;
