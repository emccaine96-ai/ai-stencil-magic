/**
 * Ink Style Panel — optional add-on for the results screen.
 *
 * Collapsed/closed by default so nothing changes for a user who doesn't open it.
 * Applies shading guide overlays and ink color changes on top of an already-generated
 * stencil, reading from cached tone data — no re-analysis.
 *
 * Part of the Shading Guide + Ink Style Add-On.
 */

import { useState } from "react";
import { applyInkStyle, type InkStyle } from "@/lib/classical/ink-style";
import { recolorInkLayer, type InkColor } from "@/lib/classical/ink-color";

interface Props {
  primaryLines: Uint8ClampedArray;
  toneIdx: Uint8Array;
  toneGray: Float32Array;
  width: number;
  height: number;
  onResult: (imageData: ImageData) => void;
}

const STYLE_LABELS: Record<InkStyle, string> = {
  lineOnly: "Line Only (default)",
  greyWashGuide: "Grey-Wash Guide",
  blackworkFill: "Blackwork Fill",
  colorBlockOutline: "Color-Block Outline",
};

const COLOR_LABELS: Record<InkColor, string> = {
  red: "Red",
  black: "Black",
  purple: "Purple",
  blue: "Blue",
};

export function InkStylePanel({ primaryLines, toneIdx, toneGray, width, height, onResult }: Props) {
  const [open, setOpen] = useState(false);
  const [style, setStyle] = useState<InkStyle>("lineOnly");
  const [color, setColor] = useState<InkColor>("red");

  const apply = (nextStyle: InkStyle, nextColor: InkColor) => {
    const composited = applyInkStyle(primaryLines, toneIdx, toneGray, width, height, {
      style: nextStyle,
      dash: { dashLengthPx: 4, gapLengthPx: 3 },
      fillDarknessThreshold: 90,
    });
    onResult(recolorInkLayer(composited, width, height, nextColor));
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-neutral-300 hover:bg-white/10"
      >
        Ink Style
      </button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[#141417]/95 backdrop-blur-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-neutral-400 uppercase">Ink Style</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs text-neutral-400 hover:text-neutral-200"
        >
          Close
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-[#00F5D4] uppercase">Style</label>
        <select
          value={style}
          onChange={(e) => {
            const s = e.target.value as InkStyle;
            setStyle(s);
            apply(s, color);
          }}
          className="w-full rounded-xl border border-white/10 bg-[#1a1a1e] px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#00F5D4]"
        >
          {Object.entries(STYLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-bold text-[#00F5D4] uppercase">Ink Color</label>
        <select
          value={color}
          onChange={(e) => {
            const c = e.target.value as InkColor;
            setColor(c);
            apply(style, c);
          }}
          className="w-full rounded-xl border border-white/10 bg-[#1a1a1e] px-3 py-2 text-sm text-neutral-200 outline-none focus:border-[#00F5D4]"
        >
          {Object.entries(COLOR_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
