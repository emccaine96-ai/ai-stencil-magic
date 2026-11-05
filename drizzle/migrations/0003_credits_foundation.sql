CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_consent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles self select" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles self insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles self update" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delta integer NOT NULL,
  reason text NOT NULL,
  request_id uuid NULL,
  store_txn_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX credit_ledger_request_reason_uniq ON public.credit_ledger (request_id, reason) WHERE request_id IS NOT NULL;
CREATE UNIQUE INDEX credit_ledger_store_txn_uniq ON public.credit_ledger (store_txn_id) WHERE store_txn_id IS NOT NULL;
CREATE INDEX credit_ledger_user_created_idx ON public.credit_ledger (user_id, created_at);
REVOKE ALL ON public.credit_ledger FROM anon, authenticated;
GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ledger self read" ON public.credit_ledger FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.generation_requests (
  request_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  cost integer NOT NULL CHECK (cost > 0),
  status text NOT NULL CHECK (status IN ('reserved','done','refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.generation_requests FROM anon, authenticated;
GRANT SELECT ON public.generation_requests TO authenticated;
GRANT ALL ON public.generation_requests TO service_role;
ALTER TABLE public.generation_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "requests self read" ON public.generation_requests FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER touch_generation_requests BEFORE UPDATE ON public.generation_requests FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.credit_balance(p_user uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(delta), 0)::integer FROM public.credit_ledger WHERE user_id = p_user
$$;

CREATE OR REPLACE FUNCTION public.reserve_credits(p_user uuid, p_request uuid, p_cost integer, p_provider text, p_model text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.generation_requests; bal integer;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 THEN RAISE EXCEPTION 'invalid_cost'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('credits:' || p_user::text));
  SELECT * INTO r FROM public.generation_requests WHERE request_id = p_request;
  IF FOUND THEN
    IF r.user_id <> p_user THEN RAISE EXCEPTION 'request_owner_mismatch'; END IF;
    RETURN jsonb_build_object('request_id', r.request_id, 'status', r.status, 'cost', r.cost,
      'balance', public.credit_balance(p_user), 'already_reserved', true);
  END IF;
  bal := public.credit_balance(p_user);
  IF bal < p_cost THEN RAISE EXCEPTION 'insufficient_credits'; END IF;
  INSERT INTO public.credit_ledger(user_id, delta, reason, request_id) VALUES (p_user, -p_cost, 'reserve', p_request);
  INSERT INTO public.generation_requests(request_id, user_id, provider, model, cost, status)
    VALUES (p_request, p_user, p_provider, p_model, p_cost, 'reserved');
  RETURN jsonb_build_object('request_id', p_request, 'status', 'reserved', 'cost', p_cost,
    'balance', bal - p_cost, 'already_reserved', false);
END $$;

CREATE OR REPLACE FUNCTION public.settle_request(p_request uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.generation_requests SET status = 'done' WHERE request_id = p_request AND status = 'reserved';
END $$;

CREATE OR REPLACE FUNCTION public.refund_request(p_request uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r public.generation_requests;
BEGIN
  SELECT * INTO r FROM public.generation_requests WHERE request_id = p_request FOR UPDATE;
  IF NOT FOUND OR r.status <> 'reserved' THEN RETURN; END IF;
  INSERT INTO public.credit_ledger(user_id, delta, reason, request_id) VALUES (r.user_id, r.cost, 'refund', p_request)
    ON CONFLICT DO NOTHING;
  UPDATE public.generation_requests SET status = 'refunded' WHERE request_id = p_request;
END $$;

CREATE OR REPLACE FUNCTION public.grant_credits(p_user uuid, p_amount integer, p_reason text, p_store_txn text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;
  INSERT INTO public.credit_ledger(user_id, delta, reason, store_txn_id) VALUES (p_user, p_amount, p_reason, p_store_txn)
    ON CONFLICT DO NOTHING;
END $$;

REVOKE EXECUTE ON FUNCTION public.credit_balance(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_credits(uuid, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_request(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_request(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_balance(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.reserve_credits(uuid, uuid, integer, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.settle_request(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_request(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, text) TO service_role;