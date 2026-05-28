import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { ChevronLeft, Upload, Loader2, Download, ChevronsLeftRight } from "lucide-react";
import logo from "@/assets/stencil-logo.png";

export const Route = createFileRoute("/create")({
  head: () => ({
    meta: [
      { title: "Create Stencil — Stencil AI" },
      { name: "description", content: "Upload a photo and generate a professional tattoo stencil with 5-tier tonal layering." },
    ],
  }),
  component: CreatePage,
});

type Style = "hatching" | "solid" | "dotwork" | "hybrid";
const STYLES: { id: Style; label: string; sub: string }[] = [
  { id: "hatching", label: "Hatching", sub: "Crosshatch shading" },
  { id: "solid", label: "Solid", sub: "Clean outlines only" },
  { id: "dotwork", label: "Dotwork", sub: "Stippling shading" },
  { id: "hybrid", label: "Hybrid", sub: "Hatch + dots + lines" },
];

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

function CreatePage() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [style, setStyle] = useState<Style>("hatching");
  const [intensity, setIntensity] = useState(0.7);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stencil, setStencil] = useState<string | null>(null);
  const [pos, setPos] = useState(50);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(file?: File | null) {
    if (!file) return;
    setStencil(null);
    setError(null);
    setPhoto(await fileToDataUrl(file));
  }

  async function generate() {
    if (!photo) return;
    setLoading(true);
    setError(null);
    setStencil(null);
    try {
      const r = await fetch("/api/stencil", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: photo, style, intensity }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || `Request failed (${r.status})`);
      setStencil(data.image);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="mx-auto max-w-3xl px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 text-sm">
            <ChevronLeft size={18} /> Back
          </Link>
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="" width={32} height={32} className="h-8 w-8" />
            <span className="font-script text-xl">Stencil AI</span>
          </Link>
          <div className="w-12" />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 space-y-8">
        <section>
          <h1 className="text-2xl font-extrabold">1. Upload your reference</h1>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0])}
          />
          <button
            onClick={() => fileRef.current?.click()}
            className="mt-4 w-full aspect-square sm:aspect-[4/3] rounded-3xl border-2 border-dashed border-border bg-card flex flex-col items-center justify-center gap-3 hover:border-primary transition overflow-hidden"
          >
            {photo ? (
              <img src={photo} alt="Uploaded" className="w-full h-full object-contain" />
            ) : (
              <>
                <div className="h-16 w-16 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-glow">
                  <Upload className="text-primary-foreground" />
                </div>
                <div className="text-sm text-muted-foreground">Tap to upload a photo</div>
              </>
            )}
          </button>
        </section>

        <section>
          <h2 className="text-2xl font-extrabold">2. Choose your style</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {STYLES.map((s) => (
              <button
                key={s.id}
                onClick={() => setStyle(s.id)}
                className={`text-left p-4 rounded-2xl border transition ${
                  style === s.id
                    ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow"
                    : "border-border bg-card hover:border-primary/50"
                }`}
              >
                <div className="font-bold">{s.label}</div>
                <div className={`text-xs mt-1 ${style === s.id ? "opacity-90" : "text-muted-foreground"}`}>
                  {s.sub}
                </div>
              </button>
            ))}
          </div>

          <div className="mt-5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Shading density</span>
              <span className="gradient-text font-bold">{Math.round(intensity * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={intensity * 100}
              onChange={(e) => setIntensity(Number(e.target.value) / 100)}
              className="w-full mt-2 accent-[oklch(0.64_0.26_303)]"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Controls the 5-tier tonal layering: shadows → dark mids → mids → light mids → highlights.
              Higher density = denser hatching/dots in darker tones.
            </p>
          </div>
        </section>

        <button
          onClick={generate}
          disabled={!photo || loading}
          className="w-full rounded-full bg-gradient-primary text-primary-foreground py-4 font-bold shadow-glow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin" size={18} /> Generating stencil…
            </>
          ) : (
            <>Generate Stencil</>
          )}
        </button>

        {error ? (
          <div className="rounded-2xl border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm">
            {error}
          </div>
        ) : null}

        {stencil ? (
          <section className="space-y-4">
            <h2 className="text-2xl font-extrabold">Your stencil</h2>
            <div className="relative aspect-square bg-white rounded-3xl overflow-hidden border border-border">
              {photo ? (
                <img
                  src={photo}
                  alt="Original"
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}
                />
              ) : null}
              <img
                src={stencil}
                alt="Stencil"
                className="absolute inset-0 h-full w-full object-cover"
                style={{ clipPath: `inset(0 0 0 ${pos}%)` }}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={pos}
                onChange={(e) => setPos(Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize"
              />
              <div className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none" style={{ left: `${pos}%` }} />
              <div
                className="absolute h-10 w-10 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center pointer-events-none shadow-glow"
                style={{ left: `calc(${pos}% - 20px)`, top: "calc(50% - 20px)" }}
              >
                <ChevronsLeftRight size={18} />
              </div>
            </div>
            <a
              href={stencil}
              download="stencil.png"
              className="w-full rounded-full bg-card border border-border py-3 font-semibold flex items-center justify-center gap-2 hover:border-primary transition"
            >
              <Download size={18} /> Download Stencil
            </a>
          </section>
        ) : null}
      </main>
    </div>
  );
}