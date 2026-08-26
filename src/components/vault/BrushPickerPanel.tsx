import { BRUSH_LABELS, type BrushId } from "@/lib/brushes";

const LETTERING_IDS: BrushId[] = ["blackletter-nib", "pointed-script"];

type Props = {
  current: BrushId;
  onPick: (id: BrushId) => void;
  onClose: () => void;
};

export function BrushPickerPanel({ current, onPick, onClose }: Props) {
  const others = (Object.keys(BRUSH_LABELS) as BrushId[]).filter(
    (id) => !LETTERING_IDS.includes(id) && id !== "eraser",
  );

  const Row = ({ id }: { id: BrushId }) => (
    <button
      type="button"
      onClick={() => onPick(id)}
      className={`w-full text-left px-3 py-2 rounded-lg text-sm ${
        current === id ? "bg-[#00F5D4]/20 text-[#00F5D4]" : "hover:bg-white/5 text-neutral-200"
      }`}
    >
      {BRUSH_LABELS[id]}
    </button>
  );

  return (
    <div className="absolute inset-x-2 bottom-[64px] z-[20] max-h-[60vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#141417]/95 backdrop-blur-xl p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-neutral-400 uppercase">Brushes</span>
        <button type="button" onClick={onClose} className="text-xs text-neutral-400">
          Close
        </button>
      </div>
      <div className="mb-3">
        <div className="text-[10px] font-bold text-[#00F5D4] uppercase mb-1">✒️ Lettering</div>
        {LETTERING_IDS.map((id) => (
          <Row key={id} id={id} />
        ))}
      </div>
      <div className="grid gap-0.5">
        {others.map((id) => (
          <Row key={id} id={id} />
        ))}
      </div>
    </div>
  );
}
