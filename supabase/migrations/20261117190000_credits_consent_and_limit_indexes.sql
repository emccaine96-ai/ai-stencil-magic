-- Server generation with credits: consent version + indexes for the per-user and global limit counts.
-- Additive only. No new tables. Safe to run more than once.
-- NOTE: this file is committed to the repo but must still be APPLIED in Lovable Cloud (the app cannot run
-- migrations itself). Until it is applied, recording AI consent will fail because the column does not exist.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ai_consent_version text;

-- Per-user limit counts: WHERE user_id = $1 AND created_at > ...
CREATE INDEX IF NOT EXISTS generation_requests_user_created_idx
  ON public.generation_requests (user_id, created_at);

-- Global daily budget: WHERE created_at >= <UTC midnight> AND status IN ('reserved','done')
CREATE INDEX IF NOT EXISTS generation_requests_created_idx
  ON public.generation_requests (created_at);
