-- Parkeerplaats voor de volgende PI: geparkeerde outcomes en de naam van die PI.
-- Eenmalig uitvoeren in Supabase: SQL Editor > New query > plak dit > Run.
alter table public.outcomes add column if not exists parked boolean not null default false;
alter table public.settings add column if not exists next_pi_name text not null default '27.1';
