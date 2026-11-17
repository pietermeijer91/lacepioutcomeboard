-- CIO Office-doelen: tweede kolom op het bord, tussen OGSM-doel en outcome.
-- Eenmalig uitvoeren in Supabase: SQL Editor > New query > plak dit > Run.
alter table public.ogsm drop constraint if exists ogsm_kind_check;
alter table public.ogsm add constraint ogsm_kind_check check (kind in ('objective','goal','cio'));
alter table public.outcomes add column if not exists cio_ref text not null default '';  -- CIO Office-doel ('' = niet gekoppeld)
