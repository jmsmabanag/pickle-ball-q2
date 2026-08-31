create table if not exists public.queue_state (
  id bigint primary key,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.queue_state enable row level security;

drop policy if exists "public read queue state" on public.queue_state;
drop policy if exists "public write queue state" on public.queue_state;

create policy "public read queue state"
on public.queue_state for select
using (true);

create policy "public write queue state"
on public.queue_state for insert
with check (true);

create policy "public update queue state"
on public.queue_state for update
using (true)
with check (true);
