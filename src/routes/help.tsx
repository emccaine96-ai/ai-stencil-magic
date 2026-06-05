import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import {
  ArrowLeft, BookOpen, Brush, Layers, Hand, Sliders, Wand2, Scissors,
  Download, Sparkles, Cloud, Shield, Smartphone, Zap, Eye, PenTool,
  MousePointer2, Move, RotateCcw, Search, ChevronRight,
} from "lucide-react";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help & Instructions — PrimalCanvas 2.0" },
      { name: "description", content: "Complete guide to every tool, brush, gesture and pro feature in PrimalCanvas 2.0 — the Procreate-class stencil studio for Android." },
    ],
  }),
  component: HelpPage,
});

type Section = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  blurb: string;
  body: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: BookOpen,
    blurb: "Open a canvas, set your size, and learn the studio layout.",
    body: (
      <div className="space-y-3">
        <p>PrimalCanvas 2.0 is a full painting studio tailored for Android tablets and phones, with Apple-Pencil-class pressure and tilt handling on any compatible stylus (S-Pen, USI 2.0, Wacom, capacitive).</p>
        <ol className="list-decimal ml-5 space-y-2">
          <li><b>Create a document</b> — tap <i>Create Stencil</i> on the home page or open the <Link to="/vault" className="text-primary underline">Vault</Link> and start a new canvas.</li>
          <li><b>Choose canvas size</b> — defaults to 1536×1536. Use the <Link to="/gpu-canvas" className="text-primary underline">GPU Canvas</Link> for huge 4096×4096 work.</li>
          <li><b>Pick a brush</b> — open the <Link to="/brushes" className="text-primary underline">Brush Studio</Link> for the full pro library (27 brushes, more via plugins).</li>
          <li><b>Paint, layer, refine, export</b> — every step is non-destructive and autosaves every 25 seconds to the local IndexedDB vault.</li>
        </ol>
      </div>
    ),
  },
  {
    id: "brushes",
    title: "Pro Brush Engine",
    icon: Brush,
    blurb: "27 hand-tuned brushes plus a full parameter editor.",
    body: (
      <div className="space-y-3">
        <p>The brush engine is GPU-accelerated via OffscreenCanvas with LRU stamp caching, so even huge brushes stay at 120 fps on modern Android tablets.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ["Sketching", "6B Pencil, HB Pencil, Charcoal, Conté — true grain via texture sampling."],
            ["Inking", "Fine Liner, Studio Pen, Technical Pen, Gel Pen — crisp pressure-tapered edges."],
            ["Painting", "Round, Soft Air, Oil Round, Watercolor Wet — wet-edge accumulation."],
            ["Shading", "Soft Brush, Smudge, Burnish — luminance-aware blending."],
            ["Tattoo", "Magnum Shader, Whip Shading, Dotwork Packer, Liner 7RL — stencil-grade contrast."],
            ["FX & Texture", "Bristle, Spray, Noise, Stamp — for last-mile detail."],
          ].map(([h, b]) => (
            <div key={h} className="rounded-md border border-border p-3">
              <div className="font-semibold text-sm">{h}</div>
              <div className="text-xs text-muted-foreground mt-1">{b}</div>
            </div>
          ))}
        </div>
        <p className="text-sm"><b>Pressure curve</b>, <b>tilt sensitivity</b>, <b>flow</b>, <b>spacing</b>, <b>jitter</b>, <b>scatter</b>, <b>taper in/out</b>, <b>wet edges</b> and <b>texture depth</b> are all per-brush. Override live with the size and flow sliders on the mobile toolbar.</p>
      </div>
    ),
  },
  {
    id: "pressure-tilt",
    title: "Pressure, Tilt & Palm Rejection",
    icon: PenTool,
    blurb: "Apple-Pencil-class input on Android.",
    body: (
      <div className="space-y-3">
        <p>The pointer router (<code>src/lib/pointer.ts</code>) filters by <code>pointerType</code> so your palm is ignored when a stylus is active. Pressure is read from the device when available and Kalman-smoothed in real time.</p>
        <ul className="list-disc ml-5 space-y-1 text-sm">
          <li><b>Pressure</b> — drives brush size and opacity per curve.</li>
          <li><b>Tilt</b> — broadens the stamp on the trailing side for graphite/charcoal realism.</li>
          <li><b>Azimuth & altitude</b> — derived from <code>tiltX/Y</code>, available to brush shaders for directional strokes.</li>
          <li><b>Velocity</b> — synthesizes pressure on devices that don't report it.</li>
          <li><b>Twist</b> — used by calligraphy / flat brushes for nib rotation.</li>
        </ul>
      </div>
    ),
  },
  {
    id: "layers",
    title: "Layer Panel",
    icon: Layers,
    blurb: "Unlimited layers, 16 blend modes, masks, clipping, adjustments.",
    body: (
      <div className="space-y-3">
        <ul className="list-disc ml-5 space-y-1 text-sm">
          <li><b>16 blend modes</b> — normal, multiply, screen, overlay, soft/hard light, dodge, burn, darken, lighten, difference, exclusion, hue, saturation, color, luminosity.</li>
          <li><b>Alpha lock</b> — paint only inside existing pixels.</li>
          <li><b>Clipping mask</b> — child layer is clipped to the alpha of the layer below.</li>
          <li><b>Layer mask</b> — non-destructive white = visible, black = hidden.</li>
          <li><b>Adjustment layers</b> — brightness, contrast, saturation, hue, invert, threshold (perfect for stencil prep).</li>
          <li><b>Group, duplicate, merge down, reorder</b> — drag the layer handle.</li>
        </ul>
        <p className="text-sm">Compositor lives in <code>src/lib/layer-system.ts</code> and renders top-down with mask and adjustment passes.</p>
      </div>
    ),
  },
  {
    id: "selection-transform",
    title: "Selection & Transform",
    icon: Scissors,
    blurb: "Rectangle, ellipse, lasso, magic wand, feather, free transform.",
    body: (
      <div className="space-y-3">
        <ul className="list-disc ml-5 space-y-1 text-sm">
          <li><b>Marquee tools</b> — rectangle, ellipse, freehand lasso.</li>
          <li><b>Magic wand</b> — adjustable tolerance, samples the composite.</li>
          <li><b>Boolean ops</b> — replace, add, subtract via the mode chip.</li>
          <li><b>Feather</b> — soft edges 0–50 px.</li>
          <li><b>Free transform</b> — move, scale, rotate, flip H/V via the corner and rotation handles.</li>
          <li><b>Marching ants</b> — animated, dual-color so it stays visible on any background.</li>
        </ul>
      </div>
    ),
  },
  {
    id: "gestures",
    title: "Multi-Touch Gestures",
    icon: Hand,
    blurb: "Procreate-style two- and three-finger shortcuts.",
    body: (
      <div className="grid sm:grid-cols-2 gap-2 text-sm">
        {[
          ["Two-finger pinch", "Zoom and rotate canvas."],
          ["Two-finger tap", "Undo."],
          ["Three-finger tap", "Redo."],
          ["Three-finger swipe down", "Open quick menu."],
          ["Four-finger tap", "Toggle fullscreen UI."],
          ["Pen + touch swipe", "Pan canvas."],
          ["Long-press color", "Eyedropper."],
          ["Long-press layer", "Layer options sheet."],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-border p-2">
            <div className="font-semibold">{k}</div>
            <div className="text-xs text-muted-foreground">{v}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "symmetry",
    title: "Symmetry & Guides",
    icon: Sparkles,
    blurb: "Vertical, horizontal, quadrant and radial symmetry.",
    body: (
      <p className="text-sm">Choose a mode from the symmetry menu in the studio header. Strokes are mirrored in real time across every axis. Use radial for mandala-style tattoo flash; quadrant for kaleidoscopic ornament.</p>
    ),
  },
  {
    id: "filters",
    title: "Filters & Stencil Tools",
    icon: Wand2,
    blurb: "Halftone, threshold, Sobel edges, Gaussian blur, 1-bit thermal.",
    body: (
      <ul className="list-disc ml-5 space-y-1 text-sm">
        <li><b>1-bit thermal stencil</b> — pure black/white, no anti-alias, ready for thermal printers.</li>
        <li><b>Floyd–Steinberg halftone</b> — true newspaper dither.</li>
        <li><b>Sobel edge</b> — auto-extract linework.</li>
        <li><b>Gaussian blur</b> — separable, GPU-accelerated.</li>
        <li><b>Tonal map</b> — remap luminance for shading prep.</li>
      </ul>
    ),
  },
  {
    id: "vector",
    title: "Vector Node Editor",
    icon: MousePointer2,
    blurb: "Convert freehand to Bézier and reshape at infinite resolution.",
    body: (
      <p className="text-sm">Open the <Link to="/nodes" className="text-primary underline">Vector Node Editor</Link>. Draw a stroke, then drag anchors and handles to refine — RDP simplification and Bézier fitting run automatically. Export to crisp SVG or 1-bit PNG for stencil printers.</p>
    ),
  },
  {
    id: "export",
    title: "Export & Print",
    icon: Download,
    blurb: "PNG, JPG, SVG, multi-layer PSD, 300 DPI PDF, animated GIF.",
    body: (
      <ul className="list-disc ml-5 space-y-1 text-sm">
        <li><b>PSD</b> — preserves every layer, blend mode and opacity for Photoshop round-trip.</li>
        <li><b>PDF</b> — 300 DPI print-ready, with title and author metadata.</li>
        <li><b>SVG</b> — vector-perfect from the node editor.</li>
        <li><b>1-bit PNG</b> — tattoo-stencil thermal printer format.</li>
        <li><b>Animated GIF</b> — timeline-frame export.</li>
      </ul>
    ),
  },
  {
    id: "collab",
    title: "Real-time Collaboration",
    icon: Cloud,
    blurb: "Live cursors, stroke broadcasting, CRDT-safe merges.",
    body: (
      <p className="text-sm">Share a document via the <i>Share</i> button. Peers see your cursor and strokes in real time over Supabase Realtime. The op-based CRDT in <code>src/lib/crdt-collab.ts</code> reconciles concurrent edits without conflicts.</p>
    ),
  },
  {
    id: "plugins",
    title: "Plugins & Marketplace",
    icon: Zap,
    blurb: "Sandboxed extensions with ECDSA signature verification.",
    body: (
      <p className="text-sm">Visit the <Link to="/plugins" className="text-primary underline">Plugins</Link> page to install community brushes, palettes and filters. Every plugin is verified against an ECDSA-P256 signature before it can run.</p>
    ),
  },
  {
    id: "ai",
    title: "AI Copilot",
    icon: Sparkles,
    blurb: "Describe what you want — get strokes, palettes and references.",
    body: (
      <p className="text-sm">Tap the sparkles icon in the studio. The AI copilot can generate reference imagery, suggest palettes, refine line art and convert sketches into stencil-ready 1-bit output.</p>
    ),
  },
  {
    id: "vault",
    title: "Vault & Cloud Sync",
    icon: Shield,
    blurb: "Local-first IndexedDB with optional encrypted cloud backup.",
    body: (
      <p className="text-sm">Everything saves locally first. Sign in to push encrypted backups to your private cloud — your work follows you across devices but never leaves your account.</p>
    ),
  },
  {
    id: "android",
    title: "Android Optimizations",
    icon: Smartphone,
    blurb: "Built thumb-first for S-Pen, USI 2.0 and Wacom on Android.",
    body: (
      <ul className="list-disc ml-5 space-y-1 text-sm">
        <li><b>Thumb-reach toolbar</b> — primary controls anchored to the bottom edge.</li>
        <li><b>Edge-to-edge canvas</b> — respects gesture insets and notches.</li>
        <li><b>120 Hz pointer sampling</b> — uses <code>getCoalescedEvents()</code> for full input fidelity.</li>
        <li><b>OffscreenCanvas workers</b> — keep the main thread free for UI.</li>
        <li><b>Tile-based undo</b> — only dirty regions snapshot, so 4K canvases stay responsive on mid-range devices.</li>
      </ul>
    ),
  },
];

function HelpPage() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string>(SECTIONS[0].id);
  const filtered = SECTIONS.filter(
    (s) => !query || (s.title + s.blurb).toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 bg-background/85 backdrop-blur-xl border-b border-border">
        <div className="mx-auto max-w-5xl px-4 h-14 flex items-center gap-3">
          <Link to="/" className="p-2 -ml-2 hover:bg-muted rounded" aria-label="back">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="font-semibold">Help & Instructions</h1>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            — PrimalCanvas 2.0
          </span>
          <div className="flex-1" />
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="pl-8 pr-3 py-1.5 text-sm bg-muted/50 rounded-md border border-border w-44 sm:w-64"
            />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8 space-y-10">
        <section className="space-y-3">
          <h2 className="text-3xl font-bold">A Procreate-class studio, tailored for Android.</h2>
          <p className="text-muted-foreground">
            PrimalCanvas 2.0 ships a full painting pipeline — pressure & tilt input,
            27 hand-tuned brushes, unlimited layers with 16 blend modes, vector node
            editing, AI copilot, collaboration and pro export. This guide walks you
            through every feature.
          </p>
          <div className="flex flex-wrap gap-2 pt-2">
            <Link to="/brushes" className="text-xs px-3 py-1.5 rounded-full bg-primary text-primary-foreground">Open Brush Studio</Link>
            <Link to="/gpu-canvas" className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted">GPU Canvas</Link>
            <Link to="/nodes" className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted">Vector Nodes</Link>
            <Link to="/plugins" className="text-xs px-3 py-1.5 rounded-full border border-border hover:bg-muted">Plugins</Link>
          </div>
        </section>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => {
                  setOpen(s.id);
                  document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className="text-left rounded-lg border border-border p-3 hover:bg-muted transition"
              >
                <div className="flex items-center gap-2">
                  <Icon className="w-4 h-4 text-primary" />
                  <span className="font-semibold text-sm">{s.title}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{s.blurb}</p>
              </button>
            );
          })}
        </div>

        <div className="space-y-4">
          {filtered.map((s) => {
            const Icon = s.icon;
            const isOpen = open === s.id;
            return (
              <section
                key={s.id}
                id={`sec-${s.id}`}
                className="rounded-xl border border-border overflow-hidden"
              >
                <button
                  onClick={() => setOpen(isOpen ? "" : s.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition"
                >
                  <Icon className="w-5 h-5 text-primary" />
                  <div className="flex-1 text-left">
                    <div className="font-semibold">{s.title}</div>
                    <div className="text-xs text-muted-foreground">{s.blurb}</div>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 transition-transform ${isOpen ? "rotate-90" : ""}`}
                  />
                </button>
                {isOpen ? (
                  <div className="px-4 pb-4 pt-1 border-t border-border bg-muted/20">
                    {s.body}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>

        <section className="rounded-xl border border-border p-5 bg-muted/20">
          <div className="flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Tips from pro tattoo artists</h3>
          </div>
          <ul className="list-disc ml-5 mt-3 text-sm space-y-1 text-muted-foreground">
            <li>Sketch with <b>6B Pencil</b> at 30% opacity, ink with <b>Studio Pen</b>, then run <b>1-bit thermal stencil</b> for printing.</li>
            <li>Use an <b>adjustment layer</b> with <i>threshold</i> on top of a watercolor reference to instantly extract linework.</li>
            <li>Lock alpha on your line layer before color-flatting to keep edges crisp.</li>
            <li>Bind two-finger tap to undo and three-finger tap to redo for thumb-free flow.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
