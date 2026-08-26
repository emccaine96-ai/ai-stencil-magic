import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import logo from "@/assets/stencil-logo.png";
import { TRUE_EXAMPLES } from "@/lib/example-assets";
import { Menu, X, Upload, Palette, Download, Check, ChevronRight, ChevronLeft, ChevronsLeftRight } from "lucide-react";

export const Route = createFileRoute("/")({ component: Index });

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="AI Stencil Magic logo" width={36} height={36} className="h-9 w-9" />
          <span className="font-script text-2xl">AI Stencil Magic</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/auth" className="rounded-full border border-border px-4 py-1.5 text-sm hover:bg-muted transition">
            Sign In
          </Link>
          <button onClick={() => setOpen((v) => !v)} aria-label="menu" className="p-2">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="mx-auto max-w-6xl px-4 pb-4 flex flex-col gap-3 text-sm">
          <Link to="/create" className="py-2" onClick={() => setOpen(false)}>
            Create Stencil
          </Link>
          <a href="#how" className="py-2" onClick={() => setOpen(false)}>
            How it works
          </a>
          <a href="#preview" className="py-2" onClick={() => setOpen(false)}>
            See Examples
          </a>
          <Link to="/vault" className="py-2 text-primary font-semibold" onClick={() => setOpen(false)}>
            My Stencils / Library
          </Link>
          <Link to="/help" className="py-2 text-primary font-semibold" onClick={() => setOpen(false)}>
            Help & Instructions
          </Link>
        </div>
      ) : null}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,oklch(0.30_0.12_300/0.45),transparent_60%)]" />
      <div className="mx-auto max-w-3xl px-4 pt-12 pb-10 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight tracking-tight">
          Turn any photo into a <span className="gradient-text">perfect stencil</span> in 30 seconds
        </h1>
        <p className="mt-5 text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">
          Better stencils mean better tattoos and happier clients. Crystal-clear lines that transfer
          perfectly every time.
        </p>
        <Link
          to="/create"
          className="inline-flex items-center gap-2 mt-8 rounded-full bg-gradient-primary text-primary-foreground px-7 py-3 font-semibold shadow-glow hover:opacity-95 transition"
        >
          Create Stencil <ChevronRight size={18} />
        </Link>
      </div>
      <div className="mx-auto max-w-6xl px-4 pb-6">
        <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4">
          {TRUE_EXAMPLES.map((e, i) => (
            <img
              key={e.id}
              src={e.after}
              alt={`Stencil sample ${i + 1}`}
              loading="lazy"
              className="snap-center shrink-0 w-[70%] sm:w-80 aspect-[4/5] object-contain rounded-2xl border border-border bg-white"
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: 1,
      icon: Upload,
      title: "Upload",
      body: "Upload any reference — portraits, animals, nature, or custom artwork.",
    },
    {
      n: 2,
      icon: Palette,
      title: "Choose Your Style",
      body: "Select clean solid outlines, dense crosshatching, dotwork, or hybrid.",
    },
    {
      n: 3,
      icon: Download,
      title: "Print Your Stencil",
      body: "Download a high-res file optimized for professional stencil results.",
    },
  ];
  return (
    <section id="how" className="py-16">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold">How it works</h2>
        <div className="mt-12 space-y-12">
          {steps.map(({ n, icon: Icon, title, body }) => (
            <div key={n} className="flex flex-col items-center">
              <div className="relative">
                <div className="h-20 w-20 rounded-2xl bg-card border border-border flex items-center justify-center shadow-glow">
                  <Icon className="text-primary" size={26} />
                </div>
                <div className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-gradient-primary text-primary-foreground text-sm font-bold flex items-center justify-center">
                  {n}
                </div>
              </div>
              <h3 className="mt-5 text-xl font-bold">{title}</h3>
              <p className="text-muted-foreground mt-2 max-w-xs">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CompareSlider({
  before,
  after,
  beforeLabel = "Original",
  afterLabel = "Stencil",
}: {
  before: string;
  after: string;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative aspect-[3/4] bg-white select-none">
      <img
        src={before}
        alt={beforeLabel}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      <img
        src={after}
        alt={afterLabel}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
        draggable={false}
      />
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-10"
        aria-label="Compare original and stencil"
      />
      <div
        className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none z-[5]"
        style={{ left: `${pos}%` }}
      />
      <div
        className="absolute h-10 w-10 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center pointer-events-none shadow-glow z-[5]"
        style={{ left: `calc(${pos}% - 20px)`, top: "calc(50% - 20px)" }}
      >
        <ChevronsLeftRight size={18} />
      </div>
      <div className="absolute top-3 left-3 rounded-full bg-black/60 text-white text-[10px] font-semibold px-2.5 py-1 pointer-events-none">
        {beforeLabel}
      </div>
      <div className="absolute top-3 right-3 rounded-full bg-primary/90 text-primary-foreground text-[10px] font-semibold px-2.5 py-1 pointer-events-none">
        {afterLabel}
      </div>
    </div>
  );
}

function BeforeAfter() {
  const [idx, setIdx] = useState(0);
  const ex = TRUE_EXAMPLES[idx];
  return (
    <section id="preview" className="py-16">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold">Real before & after</h2>
        <p className="text-muted-foreground mt-3">
          True photo → stencil pairs from AI Stencil Magic. Drag the slider to compare.
        </p>
      </div>
      <div className="mx-auto max-w-2xl px-4 mt-8">
        <div className="rounded-3xl border border-border bg-card overflow-hidden">
          <div className="flex gap-1 p-2 overflow-x-auto border-b border-border">
            {TRUE_EXAMPLES.map((e, i) => (
              <button
                key={e.id}
                onClick={() => setIdx(i)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  i === idx
                    ? "bg-gradient-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                {e.title.split(" ")[0]}
              </button>
            ))}
          </div>
          <CompareSlider
            before={ex.before}
            after={ex.after}
            beforeLabel={ex.beforeLabel}
            afterLabel={ex.afterLabel}
          />
          <div className="p-5 text-center">
            <h3 className="font-bold text-lg">{ex.title}</h3>
            <p className="text-sm text-muted-foreground mt-1">{ex.subtitle}</p>
            <div className="flex items-center justify-center gap-3 mt-4">
              <button
                onClick={() => setIdx((p) => (p - 1 + TRUE_EXAMPLES.length) % TRUE_EXAMPLES.length)}
                className="p-2 rounded-full bg-muted"
                aria-label="Previous"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-xs text-muted-foreground">
                {idx + 1} / {TRUE_EXAMPLES.length}
              </span>
              <button
                onClick={() => setIdx((p) => (p + 1) % TRUE_EXAMPLES.length)}
                className="p-2 rounded-full bg-muted"
                aria-label="Next"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BestResults() {
  return (
    <section id="results" className="py-16 bg-[oklch(0.12_0.03_295)]">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold">How to Get Best Results</h2>
        <p className="text-muted-foreground mt-3">
          High-resolution, sharp images with good lighting and strong contrast work best.
        </p>
        <div className="mt-8 rounded-3xl overflow-hidden border border-border bg-card text-left">
          <img
            src={TRUE_EXAMPLES[0].after}
            alt=""
            loading="lazy"
            className="w-full aspect-[3/4] object-cover bg-white"
          />
          <div className="p-5">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <Check size={18} /> DO
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {[
                "High-resolution designs",
                "Clear, sharp images",
                "Good lighting on subject",
                "Front-facing portraits",
                "Strong tonal contrast",
              ].map((d) => (
                <li key={d} className="flex items-center gap-2 border-b border-border pb-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {d}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center gap-2 text-destructive font-bold">
              <X size={18} /> DON'T
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {["Blurry photos", "Cluttered backgrounds", "Heavy filters", "Tiny faraway subjects"].map(
                (d) => (
                  <li key={d} className="flex items-center gap-2 border-b border-border pb-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> {d}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <main>
        <Hero />
        <HowItWorks />
        <BeforeAfter />
        <BestResults />
      </main>
      <footer className="border-t border-border py-10">
        <div className="mx-auto max-w-6xl px-4 flex items-center justify-between text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <img src={logo} alt="" width={28} height={28} className="h-7 w-7" />
            <span className="font-script text-xl">AI Stencil Magic</span>
          </div>
          <div>© {new Date().getFullYear()} AI Stencil Magic</div>
        </div>
      </footer>
    </div>
  );
}
