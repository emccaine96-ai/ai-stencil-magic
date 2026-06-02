import { createFileRoute, Link, useParams, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronLeft, Heart, GitFork, Trash2 } from "lucide-react";
import { getGalleryPost, hasLiked, toggleLike, deletePost } from "@/lib/gallery.functions";
import { supabase } from "@/integrations/supabase/client";
import { saveDocument, type DocumentData } from "@/lib/localDB";
import { v4 as uuidv4 } from "uuid";

export const Route = createFileRoute("/gallery/$postId")({
  component: PostPage,
});

function PostPage() {
  const { postId } = useParams({ from: "/gallery/$postId" });
  const navigate = useNavigate();
  const [post, setPost] = useState<any>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const uid = user?.id ?? null;
      setUserId(uid);
      const p = await getGalleryPost(postId);
      setPost(p);
      setLiked(await hasLiked(postId, uid));
    })();
  }, [postId]);

  async function onLike() {
    if (!userId) { navigate({ to: "/auth" }); return; }
    setBusy(true);
    try {
      const r = await toggleLike({ data: { postId } });
      setLiked(r.liked);
      setPost((p: any) => p ? { ...p, likes_count: p.likes_count + (r.liked ? 1 : -1) } : p);
    } finally { setBusy(false); }
  }

  async function onRemix() {
    if (!post) return;
    setBusy(true);
    try {
      const newDoc: DocumentData = {
        ...(post.payload as DocumentData),
        id: uuidv4(),
        name: (post.title || "Untitled") + " (remix)",
        createdAt: Date.now(),
        lastEdited: Date.now(),
      };
      await saveDocument(newDoc);
      navigate({ to: "/studio/$docId", params: { docId: newDoc.id } });
    } finally { setBusy(false); }
  }

  async function onDelete() {
    if (!confirm("Delete this post permanently?")) return;
    await deletePost({ data: { postId } });
    navigate({ to: "/gallery" });
  }

  if (!post) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;

  const isOwner = !!userId && userId === post.user_id;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/gallery" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="w-4 h-4" /> Gallery
          </Link>
          {isOwner && (
            <button onClick={onDelete} className="text-xs text-destructive inline-flex items-center gap-1">
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 grid md:grid-cols-[1.4fr_1fr] gap-8">
        <div className="rounded-xl overflow-hidden border border-border bg-card">
          {post.thumbnail
            ? <img src={post.thumbnail} alt={post.title} className="w-full" />
            : <div className="aspect-square bg-muted" />}
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{post.title}</h1>
          {post.description && <p className="mt-2 text-sm text-muted-foreground">{post.description}</p>}
          {post.tags?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {post.tags.map((t: string) => (
                <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">#{t}</span>
              ))}
            </div>
          )}
          <div className="mt-6 flex gap-3">
            <button onClick={onLike} disabled={busy}
              className={"inline-flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-medium transition " + (
                liked ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"
              )}>
              <Heart className={"w-4 h-4 " + (liked ? "fill-current" : "")} /> {post.likes_count}
            </button>
            <button onClick={onRemix} disabled={busy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-sm font-medium hover:opacity-90">
              <GitFork className="w-4 h-4" /> Remix
            </button>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            Published {new Date(post.created_at).toLocaleDateString()}
          </p>
        </div>
      </div>
    </div>
  );
}