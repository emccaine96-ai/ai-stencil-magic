import { Brush, Eraser, Undo2, Redo2, Layers, ChevronUp } from "lucide-react";

type Props = {
  active: "brush" | "eraser";
  onPickBrush: () => void;
  onPickEraser: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onLayers: () => void;
  onMore: () => void;
};

/** Compact, thumb-reachable toolbar for phones. Hidden on md+. */
export function MobileToolbar(p: Props) {
  const btn = "flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium text-foreground/80 active:text-primary";
  return (
    <div className="md:hidden fixed bottom-0 inset-x-0 z-40 grid grid-cols-6 border-t border-border bg-background/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <button className={btn} onClick={p.onPickBrush} data-active={p.active === "brush"}>
        <Brush className="w-5 h-5" /> Brush
      </button>
      <button className={btn} onClick={p.onPickEraser} data-active={p.active === "eraser"}>
        <Eraser className="w-5 h-5" /> Eraser
      </button>
      <button className={btn} onClick={p.onUndo}><Undo2 className="w-5 h-5" /> Undo</button>
      <button className={btn} onClick={p.onRedo}><Redo2 className="w-5 h-5" /> Redo</button>
      <button className={btn} onClick={p.onLayers}><Layers className="w-5 h-5" /> Layers</button>
      <button className={btn} onClick={p.onMore}><ChevronUp className="w-5 h-5" /> More</button>
    </div>
  );
}