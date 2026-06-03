import { createFileRoute } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import logo from "@/assets/stencil-logo.png";
import samplePortrait from "@/assets/sample-portrait.jpg";
import sample1 from "@/assets/sample-1.jpg";
import sample2 from "@/assets/sample-2.jpg";
import sample3 from "@/assets/sample-3.jpg";
import {
  Menu,
  X,
  Upload,
  Palette,
  Download,
  Check,
  ChevronRight,
  ChevronLeft,
  ChevronsLeftRight,
  Hash,
  Minus,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: Index,
});

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="PrimalPrint AI logo" width={36} height={36} className="h-9 w-9" />
          <span className="font-script text-2xl">PrimalPrint AI</span>
        </Link>
        <div className="flex items-center gap-3">
          <button className="rounded-full border border-border px-4 py-1.5 text-sm hover:bg-muted transition">
            Sign In
          </button>
          <button onClick={() => setOpen((v) => !v)} aria-label="menu" className="p-2">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="mx-auto max-w-6xl px-4 pb-4 flex flex-col gap-3 text-sm">
          <Link to="/create" className="py-2">Create Stencil</Link>
          <a href="#how" className="py-2">How it works</a>
          <a href="#results" className="py-2">Best Results</a>
          <a href="#preview" className="py-2">See Examples</a>
          <Link to="/vault" className="py-2 text-primary font-semibold">Saved Generations / Storage Vault</Link>
          <Link to="/gallery" className="py-2">Community Gallery</Link>
          <Link to="/plugins" className="py-2">Plugins</Link>
          <Link to="/nodes" className="py-2">Vector Node Editor</Link>
          <Link to="/gpu-canvas" className="py-2">GPU Canvas (4K²)</Link>
        </div>
      ) : null}
    </header>
  );
}

function PlayBanner() {
  const [shown, setShown] = useState(true);
  if (!shown) return null;
  return (
    <div className="bg-gradient-banner text-primary-foreground">
      <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between gap-3">
        <div className="font-semibold">Get PrimalPrintAI on Google Play</div>
        <div className="flex items-center gap-2">
          <button className="rounded-full bg-white text-foreground px-4 py-1.5 text-sm font-semibold">
            Download
          </button>
          <button aria-label="close" onClick={() => setShown(false)} className="p-1">
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
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
        <div className="mt-8 grid grid-cols-3 gap-4 max-w-md mx-auto">
          <Stat label="Artists Worldwide" value="1,000+" />
          <Stat label="Hours Saved Monthly" value="20+" />
          <Stat label="Average Time" value="< 30 sec" />
        </div>
        <Link
          to="/create"
          className="inline-flex items-center gap-2 mt-8 rounded-full bg-gradient-primary text-primary-foreground px-7 py-3 font-semibold shadow-glow hover:opacity-95 transition"
        >
          Create Stencil <ChevronRight size={18} />
        </Link>
      </div>
      <SampleRow />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="gradient-text font-extrabold text-xl sm:text-2xl">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function SampleRow() {
  const items = [sample1, sample2, sample3];
  return (
    <div className="mx-auto max-w-6xl px-4 pb-6">
      <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4">
        {items.map((src, i) => (
          <img
            key={i}
            src={src}
            alt={`Stencil sample ${i + 1}`}
            loading="lazy"
            className="snap-center shrink-0 w-[70%] sm:w-80 aspect-[4/5] object-cover rounded-2xl border border-border bg-white"
          />
        ))}
      </div>
    </div>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: 1,
      icon: Upload,
      title: "Upload",
      body: "Upload any reference—portraits, animals, nature, or custom artwork.",
    },
    {
      n: 2,
      icon: Palette,
      title: "Choose Your Style",
      body: "Select the preferred look—clean solid outlines, dense crosshatching, dotwork, or hybrid.",
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
        <p className="text-muted-foreground mt-3">
          Transform any image into a professional tattoo stencil in seconds.
        </p>
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

function BeforeAfter() {
  const [tab, setTab] = useState<"hatching" | "solid">("hatching");
  const [pos, setPos] = useState(50);
  return (
    <section id="preview" className="py-16">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold">See Your Stencil Come to Life</h2>
        <p className="text-muted-foreground mt-3">Professional quality stencils that artists trust</p>
      </div>

      <div className="mx-auto max-w-2xl px-4 mt-8">
        <div className="rounded-3xl border border-border bg-card overflow-hidden">
          <div className="grid grid-cols-2">
            <button
              onClick={() => setTab("hatching")}
              className={`flex items-center justify-center gap-2 py-3 font-semibold ${tab === "hatching" ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <Hash size={16} /> Hatching
            </button>
            <button
              onClick={() => setTab("solid")}
              className={`flex items-center justify-center gap-2 py-3 font-semibold ${tab === "solid" ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              <Minus size={16} /> Solid
            </button>
          </div>
          <div className="relative aspect-[3/4] bg-white">
            <img
              src={samplePortrait}
              alt="Stencil preview"
              className="absolute inset-0 h-full w-full object-cover"
              style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
            />
            <img
              src={samplePortrait}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-cover grayscale"
              style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
            />
            <input
              type="range"
              min={0}
              max={100}
              value={pos}
              onChange={(e) => setPos(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
              aria-label="Compare slider"
            />
            <div
              className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none"
              style={{ left: `${pos}%` }}
            />
            <div
              className="absolute h-10 w-10 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center pointer-events-none shadow-glow"
              style={{ left: `calc(${pos}% - 20px)`, top: "calc(50% - 20px)" }}
            >
              <ChevronsLeftRight size={18} />
            </div>
          </div>
          <div className="p-5 text-center">
            <h3 className="font-bold text-lg">Portrait Details</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Complex facial features preserved with clean, tattoo-ready line work.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function BestResults() {
  const slides = [
    {
      img: sample2,
      doList: ["High-resolution designs", "Clear, sharp images", "Good lighting on subject"],
      dontList: ["Blurry photos", "Cluttered backgrounds"],
    },
    {
      img: sample3,
      doList: ["Front-facing portraits", "Strong tonal contrast"],
      dontList: ["Heavy filters", "Tiny faraway subjects"],
    },
  ];
  const [i, setI] = useState(0);
  const s = slides[i];
  return (
    <section id="results" className="py-16 bg-[oklch(0.12_0.03_295)]">
      <div className="mx-auto max-w-3xl px-4 text-center">
        <h2 className="text-3xl sm:text-4xl font-extrabold">How to Get Best Results</h2>
        <p className="text-muted-foreground mt-3">Follow these simple guidelines for perfect stencils every time</p>
        <div className="flex justify-center gap-2 mt-6">
          {slides.map((_, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              className={`h-2 w-2 rounded-full ${idx === i ? "bg-primary" : "bg-muted-foreground/40"}`}
            />
          ))}
        </div>
        <div className="flex items-center justify-center gap-3 mt-4">
          <button onClick={() => setI((p) => Math.max(0, p - 1))} className="p-2 rounded-full bg-muted">
            <ChevronLeft size={18} />
          </button>
          <span className="rounded-full bg-gradient-primary text-primary-foreground px-5 py-1.5 text-sm font-semibold">
            « Swipe to explore »
          </span>
          <button onClick={() => setI((p) => Math.min(slides.length - 1, p + 1))} className="p-2 rounded-full bg-muted">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="mt-8 rounded-3xl overflow-hidden border border-border bg-card text-left">
          <img src={s.img} alt="" loading="lazy" className="w-full aspect-[3/4] object-cover bg-white" />
          <div className="p-5">
            <div className="flex items-center gap-2 text-emerald-400 font-bold">
              <Check size={18} /> DO
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {s.doList.map((d) => (
                <li key={d} className="flex items-center gap-2 border-b border-border pb-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {d}
                </li>
              ))}
            </ul>
            <div className="mt-5 flex items-center gap-2 text-destructive font-bold">
              <X size={18} /> DON'T
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {s.dontList.map((d) => (
                <li key={d} className="flex items-center gap-2 border-b border-border pb-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-destructive" /> {d}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-10">
      <div className="mx-auto max-w-6xl px-4 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <img src={logo} alt="" width={28} height={28} className="h-7 w-7" />
          <span className="font-script text-xl">PrimalPrint AI</span>
        </div>
        <div>© {new Date().getFullYear()} PrimalPrint AI. All rights reserved.</div>
      </div>
    </footer>
  );
}

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <PlayBanner />
      <main>
        <Hero />
        <HowItWorks />
        <BestResults />
        <BeforeAfter />
      </main>
      <Footer />
    </div>
  );
}
