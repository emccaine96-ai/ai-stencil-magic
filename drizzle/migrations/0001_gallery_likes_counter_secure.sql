CREATE OR REPLACE FUNCTION public.gallery_like_count_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
REVOKE EXECUTE ON FUNCTION public.gallery_like_count_sync() FROM PUBLIC, anon, authenticated;

-- Guard: app users (anon/authenticated) may never change likes_count directly.
-- Only the SECURITY DEFINER sync function (running as its owner) can.
CREATE OR REPLACE FUNCTION public.gallery_posts_guard_likes_count()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.likes_count IS DISTINCT FROM OLD.likes_count
     AND current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'likes_count can only be changed by liking or unliking'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.gallery_posts_guard_likes_count() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER gallery_posts_guard_likes_count
BEFORE UPDATE ON public.gallery_posts
FOR EACH ROW EXECUTE FUNCTION public.gallery_posts_guard_likes_count();

-- Also stop clients inserting a post with a pre-inflated count.
CREATE OR REPLACE FUNCTION public.gallery_posts_reset_likes_on_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.likes_count := 0;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.gallery_posts_reset_likes_on_insert() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER gallery_posts_reset_likes_on_insert
BEFORE INSERT ON public.gallery_posts
FOR EACH ROW EXECUTE FUNCTION public.gallery_posts_reset_likes_on_insert();