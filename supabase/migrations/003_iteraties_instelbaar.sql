-- Aantal iteraties en IP-iteratie instelbaar maken.
-- Eenmalig uitvoeren in Supabase: SQL Editor > New query > plak dit > Run.
alter table public.settings add column if not exists iteration_count integer not null default 4;
alter table public.settings add column if not exists ip_iteration boolean not null default true;
alter table public.settings drop constraint if exists settings_iteration_count_check;
alter table public.settings add constraint settings_iteration_count_check check (iteration_count between 2 and 6);

-- Mijlpalen mogen nu in maximaal 8 kolommen staan (6 iteraties + IP + volgende PI).
alter table public.milestones drop constraint if exists milestones_iter_check;
alter table public.milestones add constraint milestones_iter_check check (iter between 0 and 9);
