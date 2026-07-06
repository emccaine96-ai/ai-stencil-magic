import { createFileRoute, Link } from "@tanstack/react-router";
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

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header />
      <PlayBanner />
      <main>
        <Hero />
        <HowItWorks />
        <BestResults />
        <RealTransformations />
        <BeforeAfter />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
      <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 text-sm shrink-0">
          <ChevronLeft size={18} /> <span className="hidden sm:inline">Home</span>
        </Link>
        <Link to="/" className="flex items-center gap-2">
          <img src={logo} alt="PrimalPrint AI logo" width={36} height={36} className="h-9 w-9" />
          <span className="font-script text-2xl">PrimalPrint AI</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link to="/create" className="rounded-full bg-gradient-primary text-primary-foreground px-5 py-2 text-sm font-semibold">Create Stencil</Link>
          <button onClick={() => setOpen((v) => !v)} aria-label="menu" className="p-2">
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      {open && (
        <div className="mx-auto max-w-6xl px-4 pb-4 flex flex-col gap-3 text-sm">
          <Link to="/create" className="py-2">Create Stencil</Link>
          <a href="#how" className="py-2">How it works</a>
          <a href="#results" className="py-2">Best Results</a>
          <a href="#transformations" className="py-2">Transformations</a>
          <Link to="/vault" className="py-2 text-primary font-semibold">Vault</Link>
        </div>
      )}
    </header>
  );
}

function PlayBanner() { /* keep your existing if any */ return null; }

function Hero() {
  return (
    <section className="relative overflow-hidden py-20 text-center">
      <div className="mx-auto max-w-3xl px-4">
        <h1 className="text-5xl sm:text-6xl font-extrabold leading-tight tracking-tight">
          Turn any photo into a <span className="gradient-text">perfect tattoo stencil</span>
        </h1>
        <p className="mt-6 text-xl text-muted-foreground">
          Professional quality in seconds. Clean lines. Thermal printer ready.
        </p>
        <Link
          to="/create"
          className="inline-flex items-center gap-3 mt-10 rounded-full bg-gradient-primary text-primary-foreground px-10 py-4 text-lg font-semibold shadow-glow hover:brightness-110 transition"
        >
          Start Creating <ChevronRight size={24} />
        </Link>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="py-16">
      <div className="mx-auto max-w-4xl px-4 text-center">
        <h2 className="text-3xl font-bold">How it works</h2>
        <p className="mt-3 text-muted-foreground">A simple 3-step workflow built for tattoo artists — upload, refine, print.</p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="p-6 bg-card rounded-2xl shadow">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted mb-4">
              <Upload />
            </div>
            <h3 className="font-semibold">Upload</h3>
            <p className="text-sm text-muted-foreground mt-2">Drop a photo or intake shot — faces, body parts, reference images.</p>
          </div>
          <div className="p-6 bg-card rounded-2xl shadow">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted mb-4">
              <Palette />
            </div>
            <h3 className="font-semibold">Refine</h3>
            <p className="text-sm text-muted-foreground mt-2">Adjust density, remove backgrounds, and get crisp linework tailored for tattoo transfer.</p>
          </div>
          <div className="p-6 bg-card rounded-2xl shadow">
            <div className="flex items-center justify-center h-12 w-12 rounded-full bg-muted mb-4">
              <Download />
            </div>
            <h3 className="font-semibold">Print</h3>
            <p className="text-sm text-muted-foreground mt-2">Export printer-ready stencils or save to your Vault for repeat clients.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function BestResults() {
  return (
    <section id="results" className="py-16 bg-transparent">
      <div className="mx-auto max-w-6xl px-4 text-center">
        <h2 className="text-3xl font-bold">Best results</h2>
        <p className="mt-3 text-muted-foreground">Works especially well on high-contrast portraits and clear reference photos.</p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6 items-start">
          <div className="rounded-2xl overflow-hidden shadow">
            <img src={sample1} alt="Sample 1" className="w-full h-56 object-cover" />
          </div>
          <div className="rounded-2xl overflow-hidden shadow">
            <img src={sample2} alt="Sample 2" className="w-full h-56 object-cover" />
          </div>
          <div className="rounded-2xl overflow-hidden shadow">
            <img src={sample3} alt="Sample 3" className="w-full h-56 object-cover" />
          </div>
        </div>
      </div>
    </section>
  );
}

function RealTransformations() {
  const images = [
    "/attachments/1552.png",
    "/attachments/1003.png",
    "/attachments/1549.png",
    "/attachments/1561.png",
    "/attachments/1567.png",
    "/attachments/991.png",
  ];

  return (
    <section id="transformations" className="py-20 bg-card">
      <div className="mx-auto max-w-6xl px-4">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold">Real Photo → Professional Stencil</h2>
          <p className="mt-4 text-muted-foreground text-lg">See the transformation quality — real results from real clients.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {images.map((src, i) => (
            <div key={i} className="group bg-white rounded-3xl overflow-hidden shadow-xl border border-border">
              <div className="aspect-[4/5] relative overflow-hidden bg-muted">
                <img 
                  src={src} 
                  alt={`Stencil ${i+1}`} 
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                />
              </div>
              <div className="p-6">
                <p className="font-semibold">Transformation {i+1}</p>
                <p className="text-sm text-muted-foreground mt-1">Detailed, clean, and print-ready — built for professional tattoo work.</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BeforeAfter() { /* keep your existing before/after */
  return (
    <section className="py-16">
      <div className="mx-auto max-w-6xl px-4 text-center">
        <h2 className="text-3xl font-bold">Before & After</h2>
        <p className="mt-3 text-muted-foreground">Quick comparisons — see how photos become stencil-ready linework.</p>
        <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="rounded-2xl overflow-hidden shadow">
            <img src={samplePortrait} alt="Before" className="w-full h-80 object-cover" />
          </div>
          <div className="rounded-2xl overflow-hidden shadow flex items-center justify-center bg-card">
            <div className="text-center p-6">
              <h3 className="font-semibold">After</h3>
              <p className="text-muted-foreground mt-2">Clean, contrasty linework ready for transfer paper and thermal printers.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border py-12">
      <div className="mx-auto max-w-6xl px-4 text-center text-muted-foreground">
        © {new Date().getFullYear()} PrimalPrint AI • Built for Tattoo Artists
      </div>
    </footer>
  );
}
