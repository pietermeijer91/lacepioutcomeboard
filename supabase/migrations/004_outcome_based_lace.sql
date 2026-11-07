-- Outcome-based LACE: hypothese, commitment, business value, check-ins en leerpunten.
-- Eenmalig uitvoeren in Supabase: SQL Editor > New query > plak dit > Run.
alter table public.outcomes add column if not exists hypothesis text not null default '';
alter table public.outcomes add column if not exists commitment text not null default 'committed';
alter table public.outcomes add column if not exists bv_planned integer;
alter table public.outcomes add column if not exists bv_actual integer;
alter table public.outcomes add column if not exists checkins jsonb not null default '[]'::jsonb;  -- [{id, date, confidence 1-5, note, by}]

alter table public.milestones add column if not exists learning text not null default '';
alter table public.milestones add column if not exists decision text not null default '';  -- '', continue, adjust, stop
