-- Startinhoud: PI-instellingen, drie placeholder-outcomes en de vaste PI-events.
-- Optioneel; voer uit na schema.sql. Tekst tussen [haken] is bedoeld om te vervangen.

insert into public.settings (id, pi_start, iteration_weeks, pi_name)
values ('pi', '2026-12-09', 2, '')
on conflict (id) do nothing;

insert into public.outcomes (id, title, sort_order, krs, contribs) values
('o1', '[PI-outcome 1 — wat willen we bereikt hebben?]', 1,
  '[{"id":"k1","text":"[Key result — wat meten we?]","start":0,"target":100,"current":0,"unit":"%"},
    {"id":"k2","text":"[Key result 2]","start":0,"target":10,"current":0,"unit":""}]',
  '[{"id":"c1","owner":"[Wie / team]","text":"[Bijdrage aan deze outcome]"}]'),
('o2', '[PI-outcome 2]', 2,
  '[{"id":"k3","text":"[Key result]","start":0,"target":100,"current":0,"unit":"%"}]',
  '[{"id":"c2","owner":"[Wie / team]","text":"[Bijdrage]"}]'),
('o3', '[PI-outcome 3]', 3,
  '[{"id":"k4","text":"[Key result]","start":0,"target":100,"current":0,"unit":"%"}]',
  '[{"id":"c3","owner":"[Wie / team]","text":"[Bijdrage]"}]')
on conflict (id) do nothing;

insert into public.milestones (id, row_ref, iter, title, type, status, created_at) values
('m1', 'art', 0, 'PI Planning',             'fixed',   'planned', now()),
('m2', 'art', 4, 'Inspect & Adapt',         'fixed',   'planned', now() + interval '1 second'),
('m3', 'art', 5, 'PI Planning volgende PI', 'fixed',   'planned', now() + interval '2 seconds'),
('m4', 'o1',  1, '[Leermijlpaal]',          'learn',   'planned', now() + interval '3 seconds'),
('m5', 'o1',  3, '[Release]',               'release', 'planned', now() + interval '4 seconds'),
('m6', 'o2',  2, '[Synchronisatie]',        'sync',    'planned', now() + interval '5 seconds')
on conflict (id) do nothing;
