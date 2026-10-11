import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, RotateCcw, Loader2, ChevronDown } from "lucide-react";
import { KNOBS, DEFAULT_TUNING, isDefaultTuning, type V2Tuning } from "@/lib/classical-v2/tuning";

/**
 * Optional fine-tuning for the FREE client-side engine only. Never rendered for the
 * AI engines. Default positions reproduce the engine's calibrated output, so leaving
 * this closed (or untouched) changes nothing. Deliberately omits brightness / contrast /
 * opacity / size / curves / ink colour, which already live in the Retouch Studio.
 */
export function FreeEngineTuning({
  onChange,
  busy,
}: {
  /** Called (debounced) with the new tuning whenever a knob moves, or with defaults on reset. */
  onChange: (t: V2Tuning) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [tuning, setTuning] = useState<V2Tuning>(DEFAULT_TUNING);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function update(next: V2Tuning) {
    setTuning(next);
    if (timer.current) clearTimeout(timer.current);
    // Wait for the finger to pause: each render is ~0.8s, so don't queue one per pixel of drag.
    timer.current = setTimeout(() => onChangeRef.current(next), 350);
  }

  const dirty = !isDefaultTuning(tuning);

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2">
          <SlidersHorizontal size={16} className="text-primary" />
          <span className="text-sm font-semibold">Fine-tune (optional)</span>
          {busy ? <Loader2 size={14} className="animate-spin text-primary" /> : null}
        </span>
        <ChevronDown size={16} className={`text-muted-foreground transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="space-y-4">
          <p className="text-[11px] text-muted-foreground">
            Your stencil already uses the engine's best default settings. These only re-draw the lines and shading
            if you want to nudge them. Brightness, contrast and size are in the Retouch Studio.
          </p>
          {KNOBS.map((k) => (
            <div key={k.key} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium">{k.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {k.min < 0 ? (tuning[k.key] > 0 ? "+" : "") + tuning[k.key].toFixed(2) : tuning[k.key].toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min={k.min}
                max={k.max}
                step={k.step}
                value={tuning[k.key]}
                onChange={(e) => update({ ...tuning, [k.key]: Number(e.target.value) })}
                className="w-full accent-primary"
                aria-label={k.label}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>{k.lowLabel}</span>
                <span className="text-center">{k.hint}</span>
                <span>{k.highLabel}</span>
              </div>
            </div>
          ))}
          <button
            type="button"
            disabled={!dirty}
            onClick={() => {
              if (timer.current) clearTimeout(timer.current);
              setTuning(DEFAULT_TUNING);
              onChangeRef.current(DEFAULT_TUNING);
            }}
            className="w-full flex items-center justify-center gap-2 rounded-full border border-border py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCcw size={13} /> Reset to defaults
          </button>
        </div>
      ) : null}
    </div>
  );
}
