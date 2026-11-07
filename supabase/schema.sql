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
  hypothesis  text not null default '',
  commitment  text not null default 'committed',     -- committed of stretch
  bv_planned  integer,
  bv_actual   integer,
  checkins    jsonb not null default '[]'::jsonb,   -- [{id, date, confidence 1-5, note, by}]
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);

create table if not exists public.milestones (
  id          text primary key,
  row_ref     text not null,                         -- 'art' of het id van een outcome
  contrib_ref text not null default '',              -- id van de bijdrage (baan) binnen de outcome, '' = hele outcome
  iter        integer not null default 0 check (iter between 0 and 9),
  title       text not null default '',
  type        text not null default 'learn' check (type in ('fixed','learn','sync','release')),
  status      text not null default 'planned' check (status in ('planned','done','risk','missed')),
  learning    text not null default '',
  decision    text not null default '',              -- '', continue, adjust, stop
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  text
);
create index if not exists milestones_row_ref_idx on public.milestones (row_ref);
alter table public.milestones add column if not exists contrib_ref text not null default '';
create index if not exists milestones_contrib_ref_idx on public.milestones (contrib_ref);

create table if not exists public.settings (
  id               text primary key default 'pi',
  pi_start         date not null default '2026-12-09',
  iteration_weeks  integer not null default 2 check (iteration_weeks between 1 and 4),
  pi_name          text not null default '',
  iteration_count  integer not null default 4 check (iteration_count between 2 and 6),
  ip_iteration     boolean not null default true,
  updated_at       timestamptz not null default now(),
  updated_by       text
);

-- 2. Toegang: iedereen met de link leest en schrijft (geen login)
grant select, insert, update, delete on public.outcomes, public.milestones, public.settings to anon, authenticated;

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

-- 4. Planner (taken) — zie ook migrations/005_planner_taken.sql
create table if not exists public.tasks (
  id             text primary key,
  title          text not null default '',
  outcome_ref    text not null default '',            -- outcome-id, '' = Run & overig
  milestone_ref  text not null default '',            -- mijlpaal-id, '' = geen
  owner          text not null default '',
  status         text not null default 'todo' check (status in ('todo','doing','waiting','done')),
  iter           integer check (iter between 0 and 9), -- kolomindex, null = geen iteratie
  checklist      jsonb not null default '[]'::jsonb,  -- [{id, text, done}]
  notes          text not null default '',
  sort_order     double precision not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     text
);
create index if not exists tasks_outcome_ref_idx on public.tasks (outcome_ref);
create index if not exists tasks_milestone_ref_idx on public.tasks (milestone_ref);

grant select, insert, update, delete on public.tasks to anon, authenticated;
alter table public.tasks enable row level security;
drop policy if exists "open bord tasks" on public.tasks;
create policy "open bord tasks" on public.tasks
  for all to anon, authenticated using (true) with check (true);

alter table public.tasks replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.tasks; exception when duplicate_object then null; end;
end $$;
