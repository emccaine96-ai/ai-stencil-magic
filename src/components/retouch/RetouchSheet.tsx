/**
 * Retouch Studio — shared bottom-sheet primitive.
 *
 * Visual copy of the file-private `Sheet` in src/routes/touch-up.tsx (same
 * classes, same close affordance). It is duplicated here, not imported,
 * because touch-up.tsx does not export it and that file is off-limits. Used
 * by the ink-color and export sheets so every Retouch Studio sheet reads as
 * one control, as the handoff asks.
 */
import { X } from "lucide-react";
import type { ReactNode } from "react";

export function RetouchSheet({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 z-30 max-h-[70vh] overflow-y-auto rounded-t-3xl border-t border-white/10 bg-[#131316]/95 backdrop-blur-xl p-4 pb-28 space-y-3 text-white">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{title}</span>
        <button onClick={onClose} className="text-white/50 hover:text-white" aria-label="Close panel">
          <X size={16} />
        </button>
      </div>
      {children}
    </div>
  );
}

export default RetouchSheet;
