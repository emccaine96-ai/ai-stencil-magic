REVOKE SELECT ON public.cloud_documents FROM anon;
DROP POLICY IF EXISTS "shared docs public read" ON public.cloud_documents;
DROP POLICY IF EXISTS "shared docs auth read" ON public.cloud_documents;