import { Save } from "lucide-react";
import { AUTOSAVE_INTERVALS } from "@/hooks/use-autosave-prefs";

type Props = {
  enabled: boolean;
  intervalMs: number;
  onToggle: (next: boolean) => void;
  onIntervalChange: (ms: number) => void;
  onSaveNow: () => void;
  statusLabel: string;
  statusColor: string;
};

export function AutosaveSettings({
  enabled, intervalMs, onToggle, onIntervalChange, onSaveNow, statusLabel, statusColor,
}: Props) {
  return (
    <div className="p-3 border-b border-white/5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-neutral-500">Autosave</div>
        <span className="text-[10px] tabular-nums" style={{ color: statusColor }}>{statusLabel}</span>
      </div>

      {/* Toggle row */}
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onToggle(!enabled)}
        className="w-full flex items-center justify-between rounded bg-black/30 border border-white/5 px-2 py-2 mb-2 active:scale-[0.98] transition"
      >
        <span className="text-[11px] font-semibold text-neutral-200">
          {enabled ? "Autosave is on" : "Autosave is off"}
        </span>
        <span
          className="relative inline-block"
          style={{
            width: 36, height: 20, borderRadius: 999,
            background: enabled ? "#A855F7" : "rgba(255,255,255,0.15)",
            transition: "background 0.2s",
          }}
        >
          <span
            className="absolute top-[2px]"
            style={{
              width: 16, height: 16, borderRadius: 999, background: "#fff",
              left: enabled ? 18 : 2, transition: "left 0.2s",
            }}
          />
        </span>
      </button>

      {/* Interval chips */}
      <div className="grid grid-cols-3 gap-1.5 mb-2" aria-label="Autosave interval">
        {AUTOSAVE_INTERVALS.map(opt => {
          const active = opt.ms === intervalMs;
          return (
            <button
              key={opt.ms}
              type="button"
              disabled={!enabled}
              onClick={() => onIntervalChange(opt.ms)}
              className={`min-h-9 rounded text-[11px] font-semibold border transition ${
                active
                  ? "bg-[#A855F7]/20 border-[#A855F7]/60 text-white"
                  : "bg-black/30 border-white/5 text-neutral-400 hover:text-white hover:border-white/20"
              } ${enabled ? "" : "opacity-40 cursor-not-allowed"}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onSaveNow}
        className="w-full flex items-center justify-center gap-1.5 min-h-9 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-semibold text-neutral-200"
      >
        <Save size={12} /> Save now
      </button>

      <div className="mt-2 text-[9px] text-neutral-500 leading-snug">
        We'll always try to save your work when you close the tab, even with autosave off.
      </div>
    </div>
  );
}