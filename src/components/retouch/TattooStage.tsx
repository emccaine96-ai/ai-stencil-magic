/**
 * Retouch Studio — TattooStage (Tattoo Mode compositing surface).
 *
 * Renders a TattooStack (src/lib/retouch/layer-state.ts) as CSS layers:
 * reference/guide images at the bottom, each with its own transform, filter,
 * opacity and blend mode, and the live stencil canvas on top. The stencil
 * canvas is passed in as `children` so RetouchCanvas (and its engine, undo
 * history and pointer handling) is reused untouched and never remounted.
 *
 * Geometry: the stage is an "artboard" box with the stencil's exact aspect
 * ratio, fitted inside the mount area. All layer offsets are artboard pixels,
 * converted here to screen px by `k` (= displayed width / artboard width), so
 * what lines up on screen is what a flattened export would draw. The stencil
 * layer's own move/scale is applied as a CSS transform on the wrapper around
 * `children`; RetouchCanvas maps pointers through getBoundingClientRect(),
 * which is exact under translate/scale (rotation is forbidden for the stencil
 * in layer-state.ts for that reason).
 *
 * Pure presentation: no state, no side effects.
 */
import type { CSSProperties, ReactNode } from "react";
import { cssFilter, type TattooLayer, type TattooStack } from "@/lib/retouch/layer-state";

export interface TattooStageProps {
  stack: TattooStack;
  /** Displayed artboard width in screen px. Height follows the artboard aspect ratio. */
  displayWidth: number;
  /** The live stencil canvas (RetouchCanvas). */
  children: ReactNode;
  /**
   * Retouch Mode passthrough: render `children` in a plain fill-the-parent box
   * with no artboard, no reference layers and no transform, so the layout is
   * exactly what shipped before Tattoo Mode existed. The element type and tree
   * position stay the same in both modes so `children` is never remounted.
   */
  fill?: boolean;
  /**
   * Optional overlay drawn inside the stencil's own (moved/scaled) box, so it
   * stays registered with the canvas. Used for "hold to compare with original".
   */
  overlay?: ReactNode;
}

function layerStyle(layer: TattooLayer, k: number): CSSProperties {
  const t = layer.transform;
  return {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: layer.width * k,
    height: layer.height * k,
    // Centre on the artboard centre, then apply the layer's own placement about its centre.
    transform: `translate(-50%, -50%) translate(${t.x * k}px, ${t.y * k}px) rotate(${t.rotation}deg) scale(${t.scale})`,
    transformOrigin: "50% 50%",
    opacity: layer.look.opacity,
    filter: cssFilter(layer.look),
    mixBlendMode: layer.look.blendMode as CSSProperties["mixBlendMode"],
    pointerEvents: "none",
    maxWidth: "none",
    userSelect: "none",
  };
}

export function TattooStage({ stack, displayWidth, children, fill = false, overlay }: TattooStageProps) {
  // ONE return, ONE element chain to `children`, in both modes. React reconciles
  // by position + type, so if `children` sat under a different ancestor chain in
  // fill vs artboard mode it would be unmounted on every switch -- destroying
  // RetouchCanvas's engine and undo history. Verified with a real React mount
  // test (remount.test): the earlier two-branch version unmounted it.
  //
  //   root div
  //   |- [0] references container  (always present; empty in fill mode)
  //   `- [1] stencil wrapper div
  //         `- children
  const { width: aw, height: ah } = stack.artboard;
  const k = fill ? 1 : displayWidth / aw;
  const stencil = stack.layers.find((l) => l.kind === "stencil");
  const st = stencil?.transform;

  const rootStyle: CSSProperties = fill ? { position: "absolute", inset: 0 } : { width: displayWidth, height: ah * k };
  const stencilStyle: CSSProperties =
    fill || !stencil
      ? { position: "absolute", inset: 0 }
      : {
          position: "absolute",
          inset: 0,
          transform: st ? `translate(${st.x * k}px, ${st.y * k}px) scale(${st.scale})` : undefined,
          transformOrigin: "50% 50%",
          opacity: stencil.look.opacity,
          filter: cssFilter(stencil.look),
          mixBlendMode: stencil.look.blendMode as CSSProperties["mixBlendMode"],
          // A hidden stencil is still mounted (never unmounted), just not shown or clickable.
          visibility: stencil.visible ? "visible" : "hidden",
        };

  return (
    <div
      className={fill ? undefined : "relative overflow-hidden bg-white"}
      style={rootStyle}
      data-testid={fill ? "tattoo-stage-fill" : "tattoo-stage"}
    >
      <div style={{ position: "absolute", inset: 0 }} data-testid="tattoo-references">
        {fill
          ? null
          : stack.layers.map((layer) =>
              layer.kind === "stencil" || !layer.visible || !layer.src ? null : (
                <img key={layer.id} src={layer.src} alt={layer.name} draggable={false} style={layerStyle(layer, k)} />
              ),
            )}
      </div>
      {/* Stencil: RetouchCanvas is mounted here, unmodified, in both modes. */}
      <div style={stencilStyle}>
        {children}
        {overlay}
      </div>
    </div>
  );
}

export default TattooStage;
