/**
 * Retouch Studio — LayerFilmstrip (Tattoo Mode).
 *
 * Horizontal scroll row of small square layer thumbnails, bottom -> top, with
 * the stencil last. Presentational only: it renders a TattooStack
 * (src/lib/retouch/layer-state.ts) and reports intent through callbacks; it
 * owns no state and never mutates the stack.
 *
 * Visual language is ToolRow's: dark glass pill (bg-black/75 + backdrop-blur),
 * active item marked with bg-gradient-primary (ToolRow's own active fill),
 * lucide icons at size 17 on the icon buttons. Thumbnails are 36px against
 * ToolRow's ~44px buttons (about 18% smaller) so the strip reads as secondary
 * to the main dock.
 *
 * The stencil layer has no `src` (its pixels live in RetouchCanvas), so its
 * thumbnail comes from the `stencilThumb` prop.
 */
import { Eye, EyeOff, Lock, Plus } from "lucide-react";
import type { TattooLayer, TattooStack } from "@/lib/retouch/layer-state";
import { MAX_LAYERS } from "@/lib/retouch/layer-state";

export interface LayerFilmstripProps {
  stack: TattooStack;
  /** Data/object URL of the current stencil, for the stencil layer's thumbnail. */
  stencilThumb: string | null;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onAdd: () => void;
}

const KIND_LABEL: Record<TattooLayer["kind"], string> = {
  stencil: "Stencil",
  reference: "Reference",
  guide: "Guide",
};

export function LayerFilmstrip({ stack, stencilThumb, onSelect, onToggleVisible, onAdd }: LayerFilmstripProps) {
  const full = stack.layers.length >= MAX_LAYERS;
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-[132px] w-[min(480px,94vw)] rounded-2xl bg-black/75 backdrop-blur px-2 py-2">
      <div className="flex items-end gap-2 overflow-x-auto" role="listbox" aria-label="Layers">
        {stack.layers.map((layer) => {
          const active = layer.id === stack.activeId;
          const thumb = layer.kind === "stencil" ? stencilThumb : layer.src;
          return (
            <div key={layer.id} className="flex flex-col items-center gap-0.5 shrink-0">
              <button
                role="option"
                aria-selected={active}
                aria-label={`${layer.name} (${KIND_LABEL[layer.kind]})`}
                onClick={() => onSelect(layer.id)}
                className={`relative rounded-xl p-[2px] transition ${
                  active ? "bg-gradient-primary" : "bg-white/10 hover:bg-white/25"
                }`}
              >
                <span
                  className="block h-9 w-9 rounded-[10px] bg-white bg-cover bg-center overflow-hidden"
                  style={thumb ? { backgroundImage: `url(${thumb})`, backgroundSize: "contain", backgroundRepeat: "no-repeat" } : undefined}
                >
                  {!layer.visible ? <span className="block h-full w-full bg-black/55" /> : null}
                </span>
                {layer.locked ? (
                  <Lock size={9} className="absolute bottom-0.5 right-0.5 text-white drop-shadow" aria-label="Locked" />
                ) : null}
              </button>
              <button
                onClick={() => onToggleVisible(layer.id)}
                className="text-white/60 hover:text-white"
                aria-label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
              >
                {layer.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
            </div>
          );
        })}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          <button
            onClick={onAdd}
            disabled={full}
            aria-label={full ? `Layer limit reached (${MAX_LAYERS})` : "Add reference layer"}
            className="h-10 w-10 grid place-items-center rounded-xl border border-dashed border-white/30 text-white/70 hover:text-white disabled:opacity-30"
          >
            <Plus size={17} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default LayerFilmstrip;
