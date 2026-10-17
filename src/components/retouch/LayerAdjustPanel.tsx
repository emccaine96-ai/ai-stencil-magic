/**
 * Retouch Studio — LayerAdjustPanel (Tattoo Mode).
 *
 * Per-layer look + placement for the ACTIVE layer of a TattooStack
 * (src/lib/retouch/layer-state.ts). Presentational: receives the layer and
 * reports changes through callbacks; it owns no state.
 *
 * Sheet chrome is RetouchSheet (same dark-glass bottom sheet as the ink-color
 * and export sheets). Slider rows copy touch-up.tsx's `Slider` exactly
 * (label left, accent-primary range, tabular value right) so every slider in
 * the app reads as the same control. Brightness/contrast use touch-up's
 * 0.4..1.8 multiplier range, and the values come from layer-state.ts so the
 * UI and the model can never disagree about a limit.
 *
 * Sharpen/posterize are intentionally absent: the handoff flagged that the
 * Vault editor's AdjustmentValues lacks them, and this panel only needs
 * brightness/contrast (+ opacity and placement).
 */
import { Lock, LockOpen, RotateCcw, Trash2 } from "lucide-react";
import {
  BRIGHTNESS_RANGE,
  CONTRAST_RANGE,
  canRotate,
  OPACITY_RANGE,
  SCALE_RANGE,
  type LayerLook,
  type LayerTransform,
  type TattooLayer,
} from "@/lib/retouch/layer-state";
import { RetouchSheet } from "./RetouchSheet";

export interface LayerAdjustPanelProps {
  layer: TattooLayer;
  onLook: (patch: Partial<LayerLook>) => void;
  onTransform: (patch: Partial<LayerTransform>) => void;
  onResetLook: () => void;
  onToggleLock: () => void;
  /** Omitted for the stencil layer, which can never be removed. */
  onRemove?: () => void;
  onClose: () => void;
}

export function LayerAdjustPanel({
  layer,
  onLook,
  onTransform,
  onResetLook,
  onToggleLock,
  onRemove,
  onClose,
}: LayerAdjustPanelProps) {
  const isStencil = layer.kind === "stencil";
  return (
    <RetouchSheet title={`${layer.name} — adjust`} onClose={onClose}>
      <Slider
        label="Brightness"
        value={layer.look.brightness}
        {...BRIGHTNESS_RANGE}
        onChange={(v) => onLook({ brightness: v })}
      />
      <Slider
        label="Contrast"
        value={layer.look.contrast}
        {...CONTRAST_RANGE}
        onChange={(v) => onLook({ contrast: v })}
      />
      <Slider label="Opacity" value={layer.look.opacity} {...OPACITY_RANGE} onChange={(v) => onLook({ opacity: v })} />
      <Slider
        label="Size"
        value={layer.transform.scale}
        min={SCALE_RANGE.min}
        max={Math.min(SCALE_RANGE.max, 4)}
        step={0.01}
        onChange={(v) => onTransform({ scale: v })}
        disabled={layer.locked}
      />
      {canRotate(layer) ? (
        <Slider
          label="Rotate"
          value={layer.transform.rotation}
          min={-180}
          max={180}
          step={1}
          decimals={0}
          onChange={(v) => onTransform({ rotation: v })}
          disabled={layer.locked}
        />
      ) : (
        <p className="text-[11px] text-white/40">
          The stencil can be moved and resized but not rotated, so your brush always lands where you touch. Rotate the
          reference photo to match instead.
        </p>
      )}
      <div className="grid grid-cols-3 gap-2 pt-1">
        <button
          onClick={onResetLook}
          className="flex items-center justify-center gap-1 rounded-xl border border-white/15 py-2 text-xs font-semibold hover:border-primary"
        >
          <RotateCcw size={14} /> Reset
        </button>
        <button
          onClick={onToggleLock}
          className="flex items-center justify-center gap-1 rounded-xl border border-white/15 py-2 text-xs font-semibold hover:border-primary"
        >
          {layer.locked ? <LockOpen size={14} /> : <Lock size={14} />} {layer.locked ? "Unlock" : "Lock"}
        </button>
        {!isStencil && onRemove ? (
          <button
            onClick={onRemove}
            className="flex items-center justify-center gap-1 rounded-xl border border-white/15 py-2 text-xs font-semibold text-destructive hover:border-destructive"
          >
            <Trash2 size={14} /> Remove
          </button>
        ) : (
          <div />
        )}
      </div>
    </RetouchSheet>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  decimals = 2,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  decimals?: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <div className={`flex items-center gap-3 ${disabled ? "opacity-40" : ""}`}>
      <label className="text-[11px] text-white/60 w-24">{label}</label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-primary"
      />
      <span className="text-[11px] w-10 text-right tabular-nums">{value.toFixed(decimals)}</span>
    </div>
  );
}

export default LayerAdjustPanel;
