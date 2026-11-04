ALTER TABLE public.gallery_posts ADD COLUMN IF NOT EXISTS hidden boolean NOT NULL DEFAULT false;

CREATE TABLE public.gallery_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.gallery_posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, reporter_id)
);
GRANT SELECT, INSERT ON public.gallery_reports TO authenticated;
GRANT ALL ON public.gallery_reports TO service_role;
ALTER TABLE public.gallery_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports self insert" ON public.gallery_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "reports self read" ON public.gallery_reports FOR SELECT TO authenticated USING (auth.uid() = reporter_id);

CREATE TABLE public.user_blocks (
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);
GRANT SELECT, INSERT, DELETE ON public.user_blocks TO authenticated;
GRANT ALL ON public.user_blocks TO service_role;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "blocks self read" ON public.user_blocks FOR SELECT TO authenticated USING (auth.uid() = blocker_id);
CREATE POLICY "blocks self insert" ON public.user_blocks FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);
CREATE POLICY "blocks self delete" ON public.user_blocks FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "gallery public read" ON public.gallery_posts;
CREATE POLICY "gallery public read" ON public.gallery_posts FOR SELECT TO anon, authenticated USING (hidden = false);
CREATE POLICY "gallery owner read" ON public.gallery_posts FOR SELECT TO authenticated USING (auth.uid() = user_id);