/**
 * Retouch Studio — Phase 3 (TOPBAR).
 *
 * Three separate floating elements over the canvas:
 *  - Left:   circular close button (X) — same close-to-/create convention
 *            already used by src/routes/touch-up.tsx.
 *  - Center: undo / redo / trash pill, wired to the canvas via
 *            RetouchCanvasHandle (owned by RetouchStudio, passed down as props).
 *  - Right:  print / ink-color / layers, plus a separate purple commit (check)
 *            button. All four are wired (see RetouchStudio); layers toggles the
 *            Tattoo Mode filmstrip.
 *
 * Trash confirm: uses the existing shadcn AlertDialog primitive
 * (src/components/ui/alert-dialog.tsx, already installed — no new
 * dependency). No other screen in this app currently uses AlertDialog for a
 * confirm step, so this is a judgment call applying an already-installed
 * primitive rather than inventing new UI — flagging it for visibility.
 *
 * Reset semantics: "trash" clears back to the originally handed-off stencil
 * (mirrors src/routes/touch-up.tsx's existing Trash2 = reset-to-original
 * behavior). That specific semantic wasn't spelled out in the Phase 3 spec
 * beyond "requires a confirm step" — flagged as an assumption, not a hard
 * confirm, since it's the one place this phase makes a call the spec left open.
 */
import { Check, Layers, Printer, Redo2, Trash2, Undo2, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export interface RetouchTopBarProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
  /** Live selected ink color — drives the dot in the right pill. */
  inkHex: string;
  onInkColor: () => void;
  onPrint: () => void;
  onCommit: () => void;
  /** Opens the layer filmstrip (Tattoo Mode). */
  onLayers: () => void;
  layersOpen: boolean;
}

const chip =
  "h-9 w-9 grid place-items-center rounded-full text-white/80 hover:text-white transition disabled:opacity-30";

export function RetouchTopBar({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReset,
  inkHex,
  onInkColor,
  onPrint,
  onCommit,
  onLayers,
  layersOpen,
}: RetouchTopBarProps) {
  return (
    <>
      {/* Left — close */}
      <Link
        to="/create"
        className="absolute top-3 left-3 h-11 w-11 grid place-items-center rounded-full bg-black/60 backdrop-blur text-white/80 hover:text-white"
        aria-label="Close Retouch Studio"
      >
        <X size={20} />
      </Link>

      {/* Center — undo / redo / trash */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-2 py-1">
        <button onClick={onUndo} disabled={!canUndo} className={chip} aria-label="Undo">
          <Undo2 size={17} />
        </button>
        <button onClick={onRedo} disabled={!canRedo} className={chip} aria-label="Redo">
          <Redo2 size={17} />
        </button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button className={chip} aria-label="Reset canvas">
              <Trash2 size={17} />
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reset canvas?</AlertDialogTitle>
              <AlertDialogDescription>
                This clears every edit back to the original stencil. You can undo it once, right after.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onReset}>Reset</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Right — placeholders (later phases) + commit */}
      <div className="absolute top-3 right-3 flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-full bg-black/60 backdrop-blur px-2 py-1">
          <button
            onClick={onPrint}
            className={chip}
            aria-label="Print"
          >
            <Printer size={17} />
          </button>
          <button
            onClick={onInkColor}
            className="h-9 w-9 grid place-items-center rounded-full"
            aria-label="Ink color"
          >
            <span className="h-5 w-5 rounded-full border-2 border-white/70" style={{ backgroundColor: inkHex }} />
          </button>
          <button
            onClick={onLayers}
            className={layersOpen ? `${chip} text-primary` : chip}
            aria-label="Layers"
          >
            <Layers size={17} />
          </button>
        </div>
        <button
          onClick={onCommit}
          className="h-9 w-9 grid place-items-center rounded-full bg-gradient-primary text-primary-foreground"
          aria-label="Commit"
        >
          <Check size={17} />
        </button>
      </div>
    </>
  );
}

export default RetouchTopBar;
