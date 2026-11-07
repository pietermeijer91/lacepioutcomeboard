-- Koppelt een mijlpaal aan een bijdrage (baan) binnen een outcome.
-- Eenmalig uitvoeren in Supabase: SQL Editor > New query > plak dit > Run.
alter table public.milestones add column if not exists contrib_ref text not null default '';
create index if not exists milestones_contrib_ref_idx on public.milestones (contrib_ref);
