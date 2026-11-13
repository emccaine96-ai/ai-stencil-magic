// src/components/stencil/HectographV3Controls.tsx
import type { HectographV3Config, HectographOutputMode } from '@/lib/classical-v3/engine-api';
import { STENCIL_V3_PRESETS, type StencilPresetId } from '@/lib/classical-v3/useHectographEngineV3';

export interface HectographV3ControlsProps {
  config: HectographV3Config;
  onConfigChange: (next: HectographV3Config) => void;
  presetId: StencilPresetId | null;
  onPresetChange: (id: StencilPresetId) => void;
  lastDurationMs: number | null;
  disabled?: boolean;
}

const OUTPUT_MODES: { id: HectographOutputMode; label: string; hint: string }[] = [
  { id: 'hectograph-purple', label: 'Hectograph Purple', hint: 'Multi-tone violet transfer look' },
  { id: 'pro-graphite', label: 'Pro Graphite', hint: 'Continuous black and white' },
  { id: 'thermal-binary', label: '1-bit Black & White', hint: 'No grey tones, shading becomes fine dots' },
];

interface SliderRowProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

function SliderRow({ label, hint, value, min, max, step, onChange, disabled }: SliderRowProps) {
  return (
    <label className="block">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-medium text-foreground">{label}</span>
        <span className="tabular-nums">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full mt-1 accent-primary disabled:opacity-50"
      />
      <span className="text-[10px] text-muted-foreground/80">{hint}</span>
    </label>
  );
}

export function HectographV3Controls(props: HectographV3ControlsProps) {
  const {
    config, onConfigChange, presetId, onPresetChange,
    lastDurationMs, disabled,
  } = props;

  const set = <K extends keyof HectographV3Config>(key: K, value: HectographV3Config[K]) =>
    onConfigChange({ ...config, [key]: value });

  const isThermal = config.outputMode === 'thermal-binary';

  return (
    <div className="mt-3 p-4 rounded-2xl border border-border bg-card space-y-4">
      <p className="text-[11px] text-muted-foreground">
        Hectograph V3 runs locally in a background worker, with no API key and no credits. It draws single-spine
        lines and directional engraving strokes with real paper between them.
      </p>

      <div>
        <div className="text-xs font-medium text-foreground mb-1.5">Preset</div>
        <div className="grid grid-cols-1 gap-1.5">
          {(Object.keys(STENCIL_V3_PRESETS) as StencilPresetId[]).map((id) => {
            const p = STENCIL_V3_PRESETS[id];
            const active = presetId === id;
            return (
              <button
                key={id}
                type="button"
                disabled={disabled}
                onClick={() => onPresetChange(id)}
                className={`text-left px-3 py-2 rounded-xl border text-xs transition disabled:opacity-50 ${
                  active ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="font-semibold text-foreground">{p.label}</div>
                <div className="text-[10px] text-muted-foreground">{p.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-foreground mb-1.5">Output</div>
        <div className="grid grid-cols-3 gap-1.5">
          {OUTPUT_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={disabled}
              title={m.hint}
              onClick={() => set('outputMode', m.id)}
              className={`px-2 py-2 rounded-xl border text-[11px] font-medium transition disabled:opacity-50 ${
                config.outputMode === m.id ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:border-primary/50'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {isThermal ? (
          <p className="mt-1.5 text-[10px] text-muted-foreground/80">
            Thermal mode dithers shading into dots, which prints as stipple on transfer paper. For solid connected
            lines, use Hectograph Purple or Pro Graphite.
          </p>
        ) : null}
      </div>

      <SliderRow
        label="Anchor weight"
        hint="Strength of the main structural lines"
        value={config.anchorWeight}
        min={0.5}
        max={2}
        step={0.05}
        disabled={disabled}
        onChange={(v) => set('anchorWeight', v)}
      />
      <SliderRow
        label="Fine detail gain"
        hint="Sensitivity to fine ridges such as petal veins and wrinkles"
        value={config.fineDetailGain}
        min={0}
        max={2}
        step={0.05}
        disabled={disabled}
        onChange={(v) => set('fineDetailGain', v)}
      />
      <SliderRow
        label="Flow shading"
        hint="Directional engraving strokes in shaded areas (0 = lines only)"
        value={config.flowShadingStrength}
        min={0}
        max={1}
        step={0.05}
        disabled={disabled}
        onChange={(v) => set('flowShadingStrength', v)}
      />
      <SliderRow
        label="Local contrast"
        hint="Recovers detail in bright highlights and dark shadows"
        value={config.localContrastBoost}
        min={0}
        max={1}
        step={0.05}
        disabled={disabled}
        onChange={(v) => set('localContrastBoost', v)}
      />
      <SliderRow
        label="Edge halo"
        hint="Paper gap kept clear around main lines (px)"
        value={config.haloProtection}
        min={0}
        max={4}
        step={0.25}
        disabled={disabled}
        onChange={(v) => set('haloProtection', v)}
      />

      <div className="space-y-2 pt-1 border-t border-border">
        {lastDurationMs !== null ? (
          <p className="text-[10px] text-muted-foreground/70">Last render: {(lastDurationMs / 1000).toFixed(1)} s</p>
        ) : null}
      </div>
    </div>
  );
}

export default HectographV3Controls;
