
create table public.cloud_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_id text not null,
  name text not null default 'Untitled',
  thumbnail text,
  payload jsonb not null,
  share_token text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_id)
);

create index cloud_documents_user_idx on public.cloud_documents(user_id, updated_at desc);

grant select, insert, update, delete on public.cloud_documents to authenticated;
grant select on public.cloud_documents to anon;
grant all on public.cloud_documents to service_role;

alter table public.cloud_documents enable row level security;

create policy "own docs select" on public.cloud_documents for select to authenticated using (auth.uid() = user_id);
create policy "own docs insert" on public.cloud_documents for insert to authenticated with check (auth.uid() = user_id);
create policy "own docs update" on public.cloud_documents for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own docs delete" on public.cloud_documents for delete to authenticated using (auth.uid() = user_id);
create policy "shared docs public read" on public.cloud_documents for select to anon using (share_token is not null);
create policy "shared docs auth read" on public.cloud_documents for select to authenticated using (share_token is not null);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger cloud_documents_touch before update on public.cloud_documents
for each row execute function public.touch_updated_at();
