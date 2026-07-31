import { motion } from "framer-motion";
import { Clock, RotateCcw } from "lucide-react";

export type HistoryEntry = { id: string; label: string; t: number; thumbnail?: string };

type Props = {
  entries: HistoryEntry[];
  index: number;
  onScrub: (i: number) => void;
};

/** Scrubbable timeline of document snapshots. Hover preview, click to revert. */
export function HistoryScrubber({ entries, index, onScrub }: Props) {
  if (!entries.length) return null;
  return (
    <div className="rounded-lg border border-border bg-background/70 backdrop-blur p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-semibold text-foreground/70 inline-flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5" /> History
        </div>
        <button
          onClick={() => onScrub(entries.length - 1)}
          className="text-[11px] text-foreground/60 hover:text-foreground inline-flex items-center gap-1"
        >
          <RotateCcw className="w-3 h-3" /> Latest
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={entries.length - 1}
        value={index}
        onChange={(e) => onScrub(Number(e.target.value))}
        className="w-full accent-primary"
      />
      <div className="mt-2 flex gap-1 overflow-x-auto">
        {entries.map((e, i) => (
          <motion.button
            key={e.id}
            onClick={() => onScrub(i)}
            whileHover={{ y: -2 }}
            className={`relative shrink-0 w-14 h-14 rounded-md border ${i === index ? "border-primary ring-2 ring-primary/30" : "border-border"} bg-muted overflow-hidden`}
            title={`${e.label} · ${new Date(e.t).toLocaleTimeString()}`}
          >
            {e.thumbnail ? (
              <img src={e.thumbnail} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[10px] text-foreground/60">
                {i + 1}
              </div>
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
