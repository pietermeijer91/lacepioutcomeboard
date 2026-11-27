-- 013: eigenaar (naam) bij een LACE PI-outcome
-- Wordt rechtsboven in de outcome op het bord getoond. Veilig om opnieuw te draaien.
alter table public.outcomes add column if not exists owner text not null default '';
