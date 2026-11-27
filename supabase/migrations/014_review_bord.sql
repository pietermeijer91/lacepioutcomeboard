-- 014: Management Review-bord (Decisions Needed, Risks, Decisions Confirmed, Actions)
-- Veilig om opnieuw te draaien.
create table if not exists public.decisions (
  id           text primary key,
  kind         text not null default 'needed' check (kind in ('needed','risk','confirmed','action')),
  title        text not null default '',
  notes        text not null default '',
  owner        text not null default '',
  due          date,
  outcome_ref  text not null default '',            -- optioneel: id van een LACE PI-outcome
  sort_order   double precision not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   text
);
create index if not exists decisions_outcome_ref_idx on public.decisions (outcome_ref);

revoke all on public.decisions from anon;
grant select, insert, update, delete on public.decisions to authenticated;
alter table public.decisions enable row level security;
drop policy if exists "team decisions" on public.decisions;
create policy "team decisions" on public.decisions for all to authenticated using (true) with check (true);

alter table public.decisions replica identity full;
do $$
begin
  begin alter publication supabase_realtime add table public.decisions; exception when duplicate_object then null; end;
end $$;
