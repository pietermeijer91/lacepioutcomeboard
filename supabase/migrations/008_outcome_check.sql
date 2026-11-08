-- Outcome-check: vijf haalbaarheidsvragen per outcome.
-- Eenmalig uitvoeren in Supabase: SQL Editor > New query > plak dit > Run.
alter table public.outcomes add column if not exists checks jsonb not null default '{}'::jsonb;  -- {invloed, termijn, meetbaar, capaciteit, eerstestap: true/false}
