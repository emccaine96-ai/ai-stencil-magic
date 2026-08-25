import { useState, useRef, useEffect } from "react";
import {
  Crop,
  Sparkles,
  Wand2,
  Scissors,
  Type as TypeIcon,
  ImagePlus,
  Brush,
  Square,
  Shapes,
  Pen,
  Frame,
  MessageSquare,
  Grid3x3,
  FolderOpen,
  Shirt,
  Aperture,
  Star,
  Layers,
  SliersHorizontal,
  Rocket,
  Eraser,
  Stamp,
  Droplet,
  Wind,
  Contrast,
  Thermometer,
  Circle,
  FlipHorizontal2,
  Maximize2,
  Sparkle,
  Wand,
  Layout,
  Gauge,
  ZoomIn,
  PaintBucket,
  Lightbulb,
  ScanLine,
  Activity,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type DockAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  pro?: boolean;
  ai?: boolean;
  run: () => void;
};
export type DockCategory = {
  id: string;
  label: string;
  icon: LucideIcon;
  actions: DockAction[];
};

export type PicsartDockHandlers = {
  openCrop: () => void;
  setSelectionMode: () => void;
  openAdjust: () => void;
  enhance: () => void;
  resizeMenu: () => void;
  flipH: () => void;
  flipV: () => void;
  rotate90: () => void;
  perspective: () => void;
  tiltShift: () => void;
  aiExpand: () => void;
  aiReplace: () => void;
  dispersion: () => void;
  stretch: () => void;
  motion: () => void;
  shapeCrop: () => void;
  freeCrop: () => void;
  cloneStamp: () => void;
  curves: () => void;
  upscale6k: () => void;
  stencilClean: () => void;
  threshold: () => void;
  thermalBlue: () => void;
  thermalPurple: () => void;
  sharpen: () => void;
  blur: () => void;
  vignette: () => void;
  halftone: () => void;
  pixelate: () => void;
  posterize: () => void;
  edge: () => void;
  grain: () => void;
  sepia: () => void;
  lensFlare: () => void;
  glow: () => void;
  chromatic: () => void;
  gradientMap: () => void;
  smudge: () => void;
  heal: () => void;
  liquifyPush: () => void;
  liquifyInflate: () => void;
  liquifyDeflate: () => void;
  removeBg: () => void;
  cutout: () => void;
  text: () => void;
  addPhoto: () => void;
  openBrushes: () => void;
  shapeMask: () => void;
  frame: () => void;
  callout: () => void;
  draw: () => void;
  sticker: () => void;
  aiTryOn: () => void;
  apps: () => void;
  myFolders: () => void;
  border: () => void;
  shape: () => void;
  mask: () => void;
  openFilters?: () => void;
};

export function buildCategories(h: PicsartDockHandlers): DockCategory[] {
  return [
    {
      id: "draw",
      label: "Draw",
      icon: Pen,
      actions: [{ id: "draw", label: "Draw", icon: Pen, run: h.draw }],
    },
    {
      id: "brushes",
      label: "Brushes",
      icon: Brush,
      actions: [{ id: "vault", label: "Brush Library", icon: Brush, run: h.openBrushes }],
    },
    {
      id: "tools",
      label: "Tools",
      icon: Crop,
      actions: [
        { id: "crop", label: "Crop", icon: Crop, run: h.openCrop },
        { id: "free-crop", label: "Free Crop", icon: Crop, run: h.freeCrop },
        { id: "shape-crop", label: "Shape Crop", icon: Shapes, run: h.shapeCrop },
        { id: "dispersion", label: "Dispersion", icon: Sparkles, run: h.dispersion },
        { id: "clone", label: "Clone", icon: Stamp, run: h.cloneStamp },
        { id: "select-replace", label: "Select & Replace", icon: Wand2, run: h.aiReplace },
        { id: "stretch", label: "Stretch", icon: Maximize2, run: h.stretch },
        { id: "motion", label: "Motion", icon: Wind, run: h.motion },
        { id: "selection", label: "Selection", icon: ScanLine, run: h.setSelectionMode },
        { id: "curves", label: "Curves", icon: Activity, run: h.curves },
        { id: "adjust", label: "Adjust", icon: SlidersHorizontal, run: h.openAdjust },
        { id: "enhance", label: "Enhance", icon: Sparkle, run: h.enhance },
        { id: "tilt", label: "Tilt Shift", icon: Aperture, run: h.tiltShift },
        { id: "perspective", label: "Reframe", icon: Layout, run: h.perspective },
        { id: "resize", label: "Resize", icon: Maximize2, run: h.resizeMenu },
        { id: "flip", label: "Flip H", icon: FlipHorizontal2, run: h.flipH },
        { id: "upscale-6k", label: "Upscale 6K", icon: Rocket, pro: true, run: h.upscale6k },
        { id: "expand-canvas", label: "Expand Canvas", icon: Maximize2, run: h.aiExpand },
      ],
    },
    {
      id: "effects",
      label: "Effects",
      icon: Sparkles,
      actions: [
        ...(h.openFilters
          ? [{ id: "filters", label: "Filters", icon: Sparkle, run: h.openFilters }]
          : []),
        { id: "stencil-clean", label: "Stencil Clean", icon: Wand2, run: h.stencilClean },
        { id: "threshold", label: "Threshold", icon: Contrast, run: h.threshold },
        { id: "thermal-blue", label: "Thermal Blue", icon: Thermometer, run: h.thermalBlue },
        { id: "thermal-purple", label: "Thermal", icon: Thermometer, run: h.thermalPurple },
        { id: "sharpen", label: "Sharpen", icon: ZoomIn, run: h.sharpen },
        { id: "blur", label: "Blur", icon: Droplet, run: h.blur },
        { id: "vignette", label: "Vignette", icon: Circle, run: h.vignette },
        { id: "halftone", label: "Halftone", icon: Grid3x3, run: h.halftone },
        { id: "pixelate", label: "Pixelate", icon: Grid3x3, run: h.pixelate },
        { id: "posterize", label: "Posterize", icon: Layers, run: h.posterize },
        { id: "edge", label: "Edge", icon: ScanLine, run: h.edge },
        { id: "grain", label: "Grain", icon: Gauge, run: h.grain },
        { id: "sepia", label: "Sepia", icon: PaintBucket, run: h.sepia },
        { id: "lens", label: "Lens Flare", icon: Lightbulb, run: h.lensFlare },
        { id: "glow", label: "Glow", icon: Sparkles, run: h.glow },
        { id: "chromatic", label: "Chromatic", icon: Aperture, run: h.chromatic },
        { id: "gradient-map", label: "Gradient Map", icon: Droplet, run: h.gradientMap },
      ],
    },
    {
      id: "retouch",
      label: "Retouch",
      icon: Wand,
      actions: [
        { id: "smudge", label: "Smudge", icon: Droplet, run: h.smudge },
        { id: "clone", label: "Clone Stamp", icon: Stamp, run: h.cloneStamp },
        { id: "push", label: "Liquify Push", icon: Wind, run: h.liquifyPush },
        { id: "inflate", label: "Inflate", icon: Circle, run: h.liquifyInflate },
        { id: "deflate", label: "Deflate", icon: Circle, run: h.liquifyDeflate },
        { id: "heal", label: "Heal", icon: Sparkles, run: h.heal },
      ],
    },
    {
      id: "remove-bg",
      label: "Remove BG",
      icon: Eraser,
      actions: [{ id: "rm-bg", label: "Remove BG", icon: Eraser, pro: true, run: h.removeBg }],
    },
    {
      id: "cutout",
      label: "Cutout",
      icon: Scissors,
      actions: [{ id: "cutout", label: "Magic Wand", icon: Wand2, run: h.cutout }],
    },
    {
      id: "text",
      label: "Text",
      icon: TypeIcon,
      actions: [{ id: "add-text", label: "Add Text", icon: TypeIcon, run: h.text }],
    },
    {
      id: "add-photo",
      label: "Reference",
      icon: ImagePlus,
      actions: [{ id: "ref", label: "Reference Photo", icon: ImagePlus, run: h.addPhoto }],
    },
    {
      id: "sticker",
      label: "Sticker",
      icon: Star,
      actions: [{ id: "sticker", label: "Add Image", icon: Star, run: h.sticker }],
    },
    {
      id: "border",
      label: "Border",
      icon: Square,
      actions: [{ id: "border", label: "Border", icon: Square, run: h.border }],
    },
    {
      id: "shape",
      label: "Shape",
      icon: Shapes,
      actions: [
        { id: "shape-circle", label: "Circle", icon: Circle, run: () => h.shape() },
        {
          id: "shape-rect",
          label: "Rectangle",
          icon: Square,
          run: () => (h as any).shapeRect?.() ?? h.shape(),
        },
        {
          id: "shape-triangle",
          label: "Triangle",
          icon: Shapes,
          run: () => (h as any).shapeTriangle?.() ?? h.shape(),
        },
      ],
    },
    {
      id: "mask",
      label: "Mask",
      icon: Layers,
      actions: [{ id: "mask", label: "Mask", icon: Layers, run: h.mask }],
    },
    {
      id: "shape-mask",
      label: "Shape Mask",
      icon: Shapes,
      actions: [{ id: "sm", label: "Shape Mask", icon: Shapes, run: h.shapeMask }],
    },
    {
      id: "frame",
      label: "Frame",
      icon: Frame,
      actions: [{ id: "frame", label: "Frame", icon: Frame, run: h.frame }],
    },
    {
      id: "callout",
      label: "Callout",
      icon: MessageSquare,
      actions: [{ id: "callout", label: "Callout", icon: MessageSquare, run: h.callout }],
    },
    {
      id: "lens",
      label: "Lens",
      icon: Lightbulb,
      actions: [{ id: "lens", label: "Lens Flare", icon: Lightbulb, run: h.lensFlare }],
    },
    {
      id: "apps",
      label: "Plugins",
      icon: Grid3x3,
      actions: [{ id: "apps", label: "Plugins", icon: Grid3x3, run: h.apps }],
    },
    {
      id: "ai-try",
      label: "Try On",
      icon: Shirt,
      actions: [{ id: "ai-try", label: "Try On", icon: Shirt, run: h.aiTryOn }],
    },
    {
      id: "folders",
      label: "Library",
      icon: FolderOpen,
      actions: [{ id: "vault", label: "Open Library", icon: FolderOpen, run: h.myFolders }],
    },
  ];
}

type Props = {
  handlers: PicsartDockHandlers;
  hidden?: boolean;
};

export function PicsartDock({ handlers, hidden }: Props) {
  const [openCat, setOpenCat] = useState<string | null>(null);
  const cats = buildCategories(handlers);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!openCat) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest("[data-picsart-dock]")) setOpenCat(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [openCat]);

  const active = openCat ? cats.find((c) => c.id === openCat) : null;

  return (
    <div
      data-picsart-dock
      className="absolute left-0 right-0 bottom-0 z-[14] select-none"
      style={{
        opacity: hidden ? 0.12 : 1,
        pointerEvents: hidden ? "none" : "auto",
        transition: "opacity 0.2s",
      }}
    >
      {active && active.actions.length > 1 && (
        <div
          className="mx-2 mb-1 rounded-xl overflow-hidden"
          style={{
            background: "rgba(24,24,28,0.96)",
            backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 -10px 40px -10px rgba(0,0,0,0.6)",
          }}
        >
          <div className="grid grid-cols-4 gap-px bg-white/5">
            {active.actions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    a.run();
                    setOpenCat(null);
                  }}
                  className="relative flex flex-col items-center justify-center gap-1.5 py-4 bg-[#18181c] hover:bg-white/5 active:bg-white/10 transition-colors"
                >
                  {a.pro && (
                    <span className="absolute top-1 left-1/2 -translate-x-1/2 translate-x-4 px-1 py-px rounded-sm bg-[#A855F7] text-[7px] font-bold text-white">
                      PRO
                    </span>
                  )}
                  {a.ai && (
                    <span className="absolute top-1 left-1/2 -translate-x-1/2 translate-x-4 px-1 py-px rounded-sm bg-[#00F5D4] text-[7px] font-bold text-black">
                      AI
                    </span>
                  )}
                  <Icon size={22} strokeWidth={1.6} className="text-white" />
                  <span className="text-[10px] text-white/85 text-center leading-tight px-1">
                    {a.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex items-center gap-0 overflow-x-auto overflow-y-hidden no-scrollbar"
        style={{
          background: "rgba(13,13,15,0.95)",
          backdropFilter: "blur(16px)",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
          paddingTop: 8,
          scrollbarWidth: "none",
        }}
      >
        {cats.map((cat) => {
          const Icon = cat.icon;
          const isOpen = openCat === cat.id;
          const isDraw = cat.id === "draw";
          return (
            <button
              key={cat.id}
              onClick={() => {
                if (cat.actions.length === 1) {
                  cat.actions[0].run();
                  setOpenCat(null);
                  return;
                }
                setOpenCat(isOpen ? null : cat.id);
              }}
              className="shrink-0 flex flex-col items-center justify-center gap-1 px-4 min-w-[68px]"
              style={{ minHeight: 56 }}
            >
              <Icon
                size={22}
                strokeWidth={1.7}
                className={isOpen || isDraw ? "text-[#00F5D4]" : "text-white"}
              />
              <span
                className={`text-[10px] ${
                  isOpen || isDraw ? "text-[#00F5D4] font-semibold" : "text-white/85"
                }`}
              >
                {cat.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
