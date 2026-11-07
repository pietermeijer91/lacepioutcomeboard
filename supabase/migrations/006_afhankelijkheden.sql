-- Afhankelijkheden tussen mijlpalen (lijnen op het bord).
-- Eenmalig uitvoeren in Supabase: SQL Editor > New query > plak dit > Run.
alter table public.milestones add column if not exists depends_on jsonb not null default '[]'::jsonb;  -- lijst met mijlpaal-id's waar deze op wacht
