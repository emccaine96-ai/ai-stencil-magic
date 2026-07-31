import { Brush, Eraser, Undo2, Redo2, Layers, ChevronUp, Sliders } from "lucide-react";
import type { Brush as AdvBrush } from "@/lib/advanced-brushes";

type Props = {
  active: "brush" | "eraser";
  onPickBrush: () => void;
  onPickEraser: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onLayers: () => void;
  onMore: () => void;
  brushSize: number;
  setBrushSize: (n: number) => void;
  brushFlow: number;
  setBrushFlow: (n: number) => void;
  currentBrush: AdvBrush;
  onOpenBrushPicker?: () => void;
};

/**
 * Phase 6 Wave 6 — thumb-reachable mobile toolbar with size/flow sliders
 * and current-brush chip. Hidden on md+.
 */
export function MobileToolbarAdvanced(p: Props) {
  const btn =
    "flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium text-foreground/80 active:text-primary data-[active=true]:text-primary";
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)] flex flex-col gap-1 px-2 py-1">
      <button
        type="button"
        onClick={p.onOpenBrushPicker}
        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-muted text-xs"
      >
        <span className="flex items-center gap-2">
          <Sliders className="w-3.5 h-3.5" />
          <span className="font-semibold">{p.currentBrush.name}</span>
          <span className="text-muted-foreground">{p.currentBrush.category}</span>
        </span>
        <ChevronUp className="w-3.5 h-3.5" />
      </button>

      <div className="grid grid-cols-6 gap-1">
        <button
          type="button"
          className={btn}
          onClick={p.onPickBrush}
          data-active={p.active === "brush"}
        >
          <Brush className="w-5 h-5" /> Brush
        </button>
        <button
          type="button"
          className={btn}
          onClick={p.onPickEraser}
          data-active={p.active === "eraser"}
        >
          <Eraser className="w-5 h-5" /> Eraser
        </button>
        <button type="button" className={btn} onClick={p.onUndo}>
          <Undo2 className="w-5 h-5" /> Undo
        </button>
        <button type="button" className={btn} onClick={p.onRedo}>
          <Redo2 className="w-5 h-5" /> Redo
        </button>
        <button type="button" className={btn} onClick={p.onLayers}>
          <Layers className="w-5 h-5" /> Layers
        </button>
        <button type="button" className={btn} onClick={p.onMore}>
          <ChevronUp className="w-5 h-5" /> More
        </button>
      </div>

      <div className="flex items-center gap-3 px-1">
        <label htmlFor="brushSize" className="text-[11px] w-10 text-muted-foreground">
          Size
        </label>
        <input
          id="brushSize"
          type="range"
          min={1}
          max={200}
          step={1}
          value={p.brushSize}
          onChange={(e) => p.setBrushSize(Number(e.target.value))}
          className="flex-grow accent-primary"
        />
        <span className="w-10 text-[11px] text-right tabular-nums">{p.brushSize}px</span>
      </div>
      <div className="flex items-center gap-3 px-1">
        <label htmlFor="brushFlow" className="text-[11px] w-10 text-muted-foreground">
          Flow
        </label>
        <input
          id="brushFlow"
          type="range"
          min={0.01}
          max={1}
          step={0.01}
          value={p.brushFlow}
          onChange={(e) => p.setBrushFlow(Number(e.target.value))}
          className="flex-grow accent-primary"
        />
        <span className="w-10 text-[11px] text-right tabular-nums">
          {Math.round(p.brushFlow * 100)}%
        </span>
      </div>
    </div>
  );
}
