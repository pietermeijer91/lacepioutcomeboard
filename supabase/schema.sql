-- LACE PI Outcome-bord — database-schema voor Supabase
-- Uitvoeren in Supabase: SQL Editor > New query > plak dit bestand > Run.

-- Let op: het bord heeft geen login. Iedereen die de URL en de anon key kent
-- (die staan in config.js en dus in de pagina) kan het bord lezen en wijzigen.
-- Zet er dus geen vertrouwelijke informatie op.

-- 1. Tabellen
create table if not exists public.outcomes (
  id          text primary key,
  title       text not null default '',
  sort_order  integer not null default 0,
  krs         jsonb not null default '[]'::jsonb,   -- [{id, text, start, target, current, unit}]
  contribs    jsonb not null default '[]'::jsonb,   -- [{id, owner, text}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create table if not exists public.milestones (
  id          text primary key,
  row_ref     text not null,                         -- 'art' of het id van een outcome
  iter        integer not null default 0 check (iter between 0 and 5),
  title       text not null default '',
  type        text not null default 'learn' check (type in ('fixed','learn','sync','release')),
  status      text not null default 'planned' check (status in ('planned','done','risk','missed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists milestones_row_ref_idx on public.milestones (row_ref);

create table if not exists public.settings (
  id               text primary key default 'pi',
  pi_start         date not null default '2026-12-09',
  iteration_weeks  integer not null default 2 check (iteration_weeks between 1 and 4),
  pi_name          text not null default '',
  updated_at       timestamptz not null default now(),
  updated_by       text
);

-- 2. Toegang: iedereen met de link leest en schrijft (geen login)
alter table public.outcomes   enable row level security;
alter table public.milestones enable row level security;
alter table public.settings   enable row level security;

-- (opruimen van een eventuele eerdere versie met login)
drop policy if exists "team leest en schrijft outcomes" on public.outcomes;
drop policy if exists "team leest en schrijft milestones" on public.milestones;
drop policy if exists "team leest en schrijft settings" on public.settings;
drop function if exists public.board_allowed();

drop policy if exists "open bord outcomes" on public.outcomes;
create policy "open bord outcomes" on public.outcomes
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "open bord milestones" on public.milestones;
create policy "open bord milestones" on public.milestones
  for all to anon, authenticated using (true) with check (true);

drop policy if exists "open bord settings" on public.settings;
create policy "open bord settings" on public.settings
  for all to anon, authenticated using (true) with check (true);

-- 3. Live updates (Realtime) aanzetten
alter table public.outcomes   replica identity full;
alter table public.milestones replica identity full;
alter table public.settings   replica identity full;

do $$
begin
  begin alter publication supabase_realtime add table public.outcomes;   exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.milestones; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.settings;   exception when duplicate_object then null; end;
end $$;
