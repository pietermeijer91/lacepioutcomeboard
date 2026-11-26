-- 012: eigenaar (naam) bij OGSM- en CIO Office-doelen
-- Wordt rechtsboven in het doel op het bord getoond. Veilig om opnieuw te draaien.
alter table public.ogsm add column if not exists owner text not null default '';
