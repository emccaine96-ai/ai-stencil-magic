/**
 * Retouch Studio — ink color sheet (handoff piece 1).
 *
 * Ports the swatch row from src/routes/touch-up.tsx's "color" panel (same
 * INK_COLORS palette, same selected-ring styling). The custom native
 * <input type="color"> that touch-up.tsx also offers is intentionally NOT
 * carried over: the handoff forbids a native color picker here because it
 * breaks the dark-glass visual language.
 */
import { INK_COLORS } from "@/lib/touch-up/ink-lab";
import { RetouchSheet } from "./RetouchSheet";

export function InkColorSheet({
  inkHex,
  onPick,
  onClose,
}: {
  inkHex: string;
  onPick: (hex: string) => void;
  onClose: () => void;
}) {
  return (
    <RetouchSheet title="Ink color" onClose={onClose}>
      <div className="flex gap-2 flex-wrap">
        {INK_COLORS.map((c) => (
          <button
            key={c.id}
            onClick={() => onPick(c.hex)}
            title={c.name}
            aria-label={c.name}
            className={`h-9 w-9 rounded-full border-2 transition ${
              inkHex.toLowerCase() === c.hex.toLowerCase() ? "border-primary scale-110" : "border-white/20"
            }`}
            style={{ backgroundColor: c.hex }}
          />
        ))}
      </div>
      <p className="text-[11px] text-white/50">
        Recolors the ink only — transparent background is preserved for overlays and PNG export.
      </p>
    </RetouchSheet>
  );
}

export default InkColorSheet;
