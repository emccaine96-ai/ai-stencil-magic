import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, Sparkles, ChevronLeft, Image as ImageIcon } from "lucide-react";
import { listGallery, type GalleryListItem } from "@/lib/gallery.functions";

export const Route = createFileRoute("/gallery")({
  head: () => ({
    meta: [
      { title: "Community Gallery — PrimalCanvas" },
      { name: "description", content: "Browse stencils published by the PrimalCanvas community. Like, remix, and download." },
      { property: "og:title", content: "Community Gallery — PrimalCanvas" },
      { property: "og:description", content: "Public stencils from artists worldwide." },
    ],
  }),
  component: GalleryPage,
});

function GalleryPage() {
  const [sort, setSort] = useState<"new" | "top">("new");
  const [items, setItems] = useState<GalleryListItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    listGallery({ sort }).then(d => { if (alive) setItems(d); }).catch(() => alive && setItems([]));
    return () => { alive = false; };
  }, [sort]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" /> Home
          </Link>
          <h1 className="text-base font-semibold tracking-tight">Community Gallery</h1>
          <Link to="/vault" className="text-sm text-muted-foreground hover:text-foreground">My Vault</Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <div className="flex items-center gap-2 mb-6">
          {(["new", "top"] as const).map(s => (
            <button key={s} onClick={() => setSort(s)}
              className={"px-3 py-1.5 rounded-full text-xs font-medium border transition " + (
                sort === s ? "bg-foreground text-background border-foreground" : "border-border text-muted-foreground hover:text-foreground"
              )}>
              {s === "new" ? "Newest" : "Top liked"}
            </button>
          ))}
        </div>

        {items === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <div className="border border-dashed border-border rounded-xl p-12 text-center">
            <Sparkles className="w-8 h-8 mx-auto text-muted-foreground mb-3" />
            <h2 className="text-lg font-semibold">No public stencils yet</h2>
            <p className="text-sm text-muted-foreground mt-1">Be the first to publish from the Studio.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {items.map(p => (
              <Link key={p.id} to="/gallery/$postId" params={{ postId: p.id }}
                className="group rounded-xl overflow-hidden border border-border bg-card hover:border-primary/60 transition">
                <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                  {p.thumbnail
                    ? <img src={p.thumbnail} alt={p.title} className="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" />
                    : <ImageIcon className="w-8 h-8 text-muted-foreground" />}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold truncate">{p.title}</h3>
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Heart className="w-3.5 h-3.5" /> {p.likes_count}
                    </span>
                  </div>
                  {p.tags?.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {p.tags.slice(0, 3).map(t => (
                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">#{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}