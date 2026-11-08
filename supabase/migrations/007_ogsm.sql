-- OGSM: ambitie (Objective) en doelen (Goals) waar PI-outcomes aan bijdragen.
-- Eenmalig uitvoeren in Supabase: SQL Editor > New query > plak dit > Run.
create table if not exists public.ogsm (
  id          text primary key,
  kind        text not null default 'goal' check (kind in ('objective','goal')),
  code        text not null default '',   -- bijv. G1
  title       text not null default '',
  strategy    text not null default '',
  measure     text not null default '',
  color       integer not null default 1 check (color between 1 and 6),
  sort_order  double precision not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
grant select, insert, update, delete on public.ogsm to anon, authenticated;
alter table public.ogsm enable row level security;
drop policy if exists "open bord ogsm" on public.ogsm;
create policy "open bord ogsm" on public.ogsm
  for all to anon, authenticated using (true) with check (true);
alter table public.ogsm replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.ogsm; exception when duplicate_object then null; end;
end $$;

-- Koppeling van outcomes aan een hoofddoel en eventuele extra doelen
alter table public.outcomes add column if not exists ogsm_ref text not null default '';
alter table public.outcomes add column if not exists ogsm_extra jsonb not null default '[]'::jsonb;
