-- Alle mijlpalen van de outcomes op het bord verwijderen
-- (de mijlpalen van items op de parkeerplaats blijven staan).
-- Uitvoeren in Supabase: SQL Editor > New query > plak dit bestand > Run.

-- 1. Back-up, voor het geval je iets terug wilt
create table if not exists public.milestones_backup_20261123 as
  select * from public.milestones where false;
alter table public.milestones_backup_20261123 enable row level security; -- niet bereikbaar via de API
insert into public.milestones_backup_20261123
  select m.* from public.milestones m
  join public.outcomes o on o.id = m.row_ref
  where not o.parked
    and m.id not in (select id from public.milestones_backup_20261123);

-- 2. Taken in de planner loskoppelen van deze mijlpalen (de taken zelf blijven staan)
update public.tasks set milestone_ref = ''
  where milestone_ref in (select id from public.milestones_backup_20261123);

-- 3. Verwijderen
delete from public.milestones m
  using public.outcomes o
  where o.id = m.row_ref and not o.parked;

-- 4. Controle
select (select count(*) from public.milestones_backup_20261123) as verwijderd_en_bewaard,
       (select count(*) from public.milestones) as nog_over_parkeerplaats_en_oud;
