-- Subscription state. Written ONLY by the server (Stripe webhook, service role); clients can read their own row.
create table public.subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'gemini', 'pro')),
  status text not null default 'inactive' check (status in ('inactive', 'active', 'trialing', 'past_due', 'canceled')),
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Users may READ their own subscription. No insert/update/delete policy exists for clients, so only the
-- service role (which bypasses RLS) can change tier. A user cannot grant themselves a plan.
create policy "own subscription read" on public.subscriptions for select to authenticated using (auth.uid() = user_id);

create trigger subscriptions_touch before update on public.subscriptions
  for each row execute function public.touch_updated_at();
