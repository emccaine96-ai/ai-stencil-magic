
-- Marketplace & Community tables for Phase 5
CREATE TABLE public.gallery_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  doc_id uuid REFERENCES public.cloud_documents(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Untitled',
  description text,
  thumbnail text,
  payload jsonb NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  remix_of uuid REFERENCES public.gallery_posts(id) ON DELETE SET NULL,
  likes_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.gallery_posts TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gallery_posts TO authenticated;
GRANT ALL ON public.gallery_posts TO service_role;
ALTER TABLE public.gallery_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gallery public read" ON public.gallery_posts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "gallery owner insert" ON public.gallery_posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "gallery owner update" ON public.gallery_posts FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "gallery owner delete" ON public.gallery_posts FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX gallery_posts_created_idx ON public.gallery_posts (created_at DESC);
CREATE INDEX gallery_posts_likes_idx ON public.gallery_posts (likes_count DESC);
CREATE TRIGGER touch_gallery_posts BEFORE UPDATE ON public.gallery_posts FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.gallery_likes (
  post_id uuid NOT NULL REFERENCES public.gallery_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.gallery_likes TO authenticated;
GRANT SELECT ON public.gallery_likes TO anon;
GRANT ALL ON public.gallery_likes TO service_role;
ALTER TABLE public.gallery_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "likes public read" ON public.gallery_likes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "likes self insert" ON public.gallery_likes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "likes self delete" ON public.gallery_likes FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.gallery_like_count_sync()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.gallery_posts SET likes_count = likes_count + 1 WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.gallery_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER gallery_likes_sync AFTER INSERT OR DELETE ON public.gallery_likes
FOR EACH ROW EXECUTE FUNCTION public.gallery_like_count_sync();

CREATE TABLE public.brush_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  cover text,
  brushes jsonb NOT NULL,
  downloads integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.brush_packs TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.brush_packs TO authenticated;
GRANT ALL ON public.brush_packs TO service_role;
ALTER TABLE public.brush_packs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packs public read" ON public.brush_packs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "packs owner insert" ON public.brush_packs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "packs owner update" ON public.brush_packs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "packs owner delete" ON public.brush_packs FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER touch_brush_packs BEFORE UPDATE ON public.brush_packs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
