-- Eigen planner: taken gekoppeld aan outcomes en mijlpalen.
-- Eenmalig uitvoeren in Supabase: SQL Editor > New query > plak dit > Run.
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
