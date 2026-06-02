import { useState } from "react";
import { X, Send } from "lucide-react";
import { publishToGallery } from "@/lib/gallery.functions";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  defaultTitle: string;
  thumbnail: string;
  payload: unknown;
  onClose: () => void;
  onPublished: (postId: string) => void;
};

export function PublishGalleryModal({ defaultTitle, thumbnail, payload, onClose, onPublished }: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true); setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError("Sign in first."); setBusy(false); return; }
      const row = await publishToGallery({
        data: {
          title: title.trim() || "Untitled",
          description: description.trim() || null,
          thumbnail,
          payload,
          tags: tags.split(",").map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 12),
        },
      });
      onPublished(row.id);
    } catch (e: any) {
      setError(e.message || "Failed to publish");
    } finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-xl w-full max-w-md p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Publish to Gallery</h2>
          <button onClick={onClose}><X className="w-4 h-4" /></button>
        </div>
        <img src={thumbnail} alt="" className="w-full rounded border border-border max-h-60 object-contain bg-muted" />
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Title"
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm" />
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe your stencil (optional)"
          className="w-full bg-background border border-border rounded px-3 py-2 text-sm resize-none" rows={3} />
        <input value={tags} onChange={e => setTags(e.target.value)} placeholder="tags, comma, separated"
          className="w-full bg-background border border-border rounded px-3 py-2 text-xs" />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-sm text-muted-foreground px-3 py-1.5">Cancel</button>
          <button onClick={submit} disabled={busy}
            className="inline-flex items-center gap-1.5 bg-foreground text-background text-sm px-3 py-1.5 rounded-md disabled:opacity-50">
            <Send className="w-4 h-4" /> {busy ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
    </div>
  );
}