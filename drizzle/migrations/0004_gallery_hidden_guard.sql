CREATE OR REPLACE FUNCTION public.gallery_posts_guard_hidden()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.hidden IS DISTINCT FROM OLD.hidden
     AND current_user IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'hidden can only be changed by moderation'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' AND current_user IN ('anon', 'authenticated') THEN
    NEW.hidden := false;
  END IF;
  RETURN NEW;
END $function$;

CREATE TRIGGER gallery_posts_guard_hidden
BEFORE INSERT OR UPDATE ON public.gallery_posts
FOR EACH ROW EXECUTE FUNCTION public.gallery_posts_guard_hidden();