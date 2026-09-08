import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Sparkles, Image as ImageIcon, Droplet, Palette, Paintbrush } from "lucide-react";
import { Upscaler } from "./Upscaler";
import { InkInventory } from "./InkInventory";
import { ColorWheel } from "./ColorWheel";

type Tab = "upscaler" | "ink" | "wheel";

export function MasterSuite({
  photo,
  onReplacePhoto,
}: {
  photo: string | null;
  stencilUrl: string | null;
  onReplacePhoto: (dataUrl: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("upscaler");

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs hover:border-primary transition"
      >
        <Sparkles size={14} className="text-primary" />
        <span className="font-semibold">Studio Suite</span>
        <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="fixed sm:absolute inset-x-2 sm:inset-x-auto sm:right-0 top-16 sm:top-auto sm:mt-2 sm:w-[380px] z-40 rounded-2xl border border-border bg-card shadow-2xl">
          <div className="flex border-b border-border text-[11px]">
            {(
              [
                { id: "upscaler", label: "Upscale", icon: ImageIcon },
                { id: "ink", label: "Inks", icon: Droplet },
                { id: "wheel", label: "Wheel", icon: Palette },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1 py-2.5 transition ${tab === t.id ? "bg-gradient-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                <t.icon size={12} /> {t.label}
              </button>
            ))}
          </div>
          <div className="p-3 max-h-[70vh] overflow-y-auto">
            {tab === "upscaler" ? <Upscaler photo={photo} onReplace={onReplacePhoto} /> : null}
            {tab === "ink" ? <InkInventory photo={photo} /> : null}
            {tab === "wheel" ? <ColorWheel /> : null}
          </div>
          <div className="border-t border-border p-2">
            <Link
              to="/touch-up"
              className="flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted transition"
              onClick={() => setOpen(false)}
            >
              <Paintbrush size={12} /> Open Touch-Up Studio
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
