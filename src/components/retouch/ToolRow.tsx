/**
 * Retouch Studio — Phase 4 (TOOLROW).
 *
 * Six tools, matching the MISSION line exactly: Brush / Eraser / Curves /
 * Lighten / Darken / Fills. This is touch-up.tsx's own tool dock (verified
 * by direct read of src/routes/touch-up.tsx), trimmed from its 9 tools down
 * to these 6 — Smart Erase, Sample (eyedropper) and Pan are out of scope for
 * Retouch Mode's mission ("NOT a general image editor") and are not carried
 * over.
 *
 * Curves is not a `RetouchTool` (see RetouchCanvas.tsx) — same split as
 * touch-up.tsx, where Curves toggles a bottom panel instead of changing the
 * active drawing tool. It's rendered here as a 6th button so it reads as
 * part of the same row, exactly like touch-up.tsx appends its own Curves
 * button after the tools.map().
 *
 * "Hold to compare with original" sub-button is carried over unchanged —
 * it's part of the same dock container in touch-up.tsx, not a separate
 * component, so it lives here too (RetouchStudio owns the actual
 * showCompare boolean and the original-stencil overlay).
 */
import { Eraser, Moon, PaintBucket, Paintbrush, Spline, Sun } from "lucide-react";
import type { RetouchTool } from "./RetouchCanvas";

export interface ToolRowProps {
  tool: RetouchTool;
  curvesOpen: boolean;
  onSelectTool: (tool: RetouchTool) => void;
  onToggleCurves: () => void;
  onCompareStart: () => void;
  onCompareEnd: () => void;
}

export function ToolRow({ tool, curvesOpen, onSelectTool, onToggleCurves, onCompareStart, onCompareEnd }: ToolRowProps) {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-4 w-[min(480px,96vw)] rounded-3xl bg-black/75 backdrop-blur px-2 py-2">
      {/* Order follows the MISSION line: Brush, Eraser, Curves, Lighten, Darken, Fills. */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
        <ToolButton active={tool === "brush"} icon={Paintbrush} label="Brush" onClick={() => onSelectTool("brush")} />
        <ToolButton active={tool === "erase"} icon={Eraser} label="Eraser" onClick={() => onSelectTool("erase")} />
        <ToolButton active={curvesOpen} icon={Spline} label="Curves" onClick={onToggleCurves} />
        <ToolButton active={tool === "lighten"} icon={Sun} label="Lighten" onClick={() => onSelectTool("lighten")} />
        <ToolButton active={tool === "darken"} icon={Moon} label="Darken" onClick={() => onSelectTool("darken")} />
        <ToolButton
          active={tool === "remove-fill"}
          icon={PaintBucket}
          label="Fills"
          onClick={() => onSelectTool("remove-fill")}
        />
      </div>
      <button
        onPointerDown={onCompareStart}
        onPointerUp={onCompareEnd}
        onPointerLeave={onCompareEnd}
        className="mt-1 w-full text-center text-[10px] text-white/40 hover:text-white/80"
      >
        Hold to compare with original
      </button>
    </div>
  );
}

function ToolButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Paintbrush;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 py-1.5 rounded-2xl text-[9px] font-semibold transition ${
        active ? "bg-gradient-primary text-primary-foreground" : "text-white/70 hover:text-white"
      }`}
    >
      <Icon size={17} /> {label}
    </button>
  );
}

export default ToolRow;
