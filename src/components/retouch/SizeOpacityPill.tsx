/**
 * Retouch Studio — Phase 4 (SIZEOPACITYPILL).
 *
 * One settings pill, Size + Opacity side by side, per the MISSION line.
 * Ranges/steps/defaults are copied exactly from touch-up.tsx's own Size/
 * Opacity capsule (verified by direct read): size 1–120 (default 25),
 * opacity 0.05–1 in steps of 0.05 (default 0.25) — same brush feel as the
 * existing studio, not reinvented.
 *
 * bottom-[132px] is touch-up.tsx's own verified offset for its Size/Opacity
 * capsule, sitting above a dock that wraps to 2 rows on narrow screens —
 * ToolRow's 6 tools over 3 columns wrap to the same 2 rows on mobile, so
 * this is the matching real value, not a guessed one.
 */
export interface SizeOpacityPillProps {
  size: number;
  opacity: number;
  onSizeChange: (size: number) => void;
  onOpacityChange: (opacity: number) => void;
}

export const DEFAULT_SIZE = 25;
export const DEFAULT_OPACITY = 0.25;

export function SizeOpacityPill({ size, opacity, onSizeChange, onOpacityChange }: SizeOpacityPillProps) {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-[132px] w-[min(480px,94vw)] flex items-center gap-3 rounded-full bg-black/70 backdrop-blur px-4 py-2 text-[11px]">
      <span className="text-white/60">Size</span>
      <input
        type="range"
        min={1}
        max={120}
        value={size}
        onChange={(e) => onSizeChange(Number(e.target.value))}
        className="flex-1 accent-primary"
      />
      <span className="w-6 tabular-nums">{size}</span>
      <span className="text-white/60">Opacity</span>
      <input
        type="range"
        min={0.05}
        max={1}
        step={0.05}
        value={opacity}
        onChange={(e) => onOpacityChange(Number(e.target.value))}
        className="flex-1 accent-primary"
      />
      <span className="w-8 tabular-nums">{Math.round(opacity * 100)}%</span>
    </div>
  );
}

export default SizeOpacityPill;
