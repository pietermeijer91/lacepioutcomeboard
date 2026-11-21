-- Ideeën voor PI 27.1 op de parkeerplaats zetten
-- Uitvoeren in Supabase: SQL Editor > New query > plak dit bestand > Run.
--
-- Wat het doet:
-- * Zet 5 outcomes op de parkeerplaats (parked = true), dus nog niet op het bord.
--   "ART coaching: Tactisch vierkant" en "Outcome-driven werken pilot ITF" zijn
--   samengevoegd tot één outcome "ART coaching maakt het verschil" met twee bijdragen.
-- * Koppelt elke outcome aan het OGSM-doel (01, 04 of 05) en waar nodig aan
--   CIO Office-doel 4. Bestaat een doel nog niet (op titel of code), dan wordt het aangemaakt.
-- * Vult hypothese (PI-outcome, bewijsbron, te bevestigen), key results, bijdragen en
--   de stappen per iteratie als mijlpalen. Die mijlpalen worden pas zichtbaar als je de
--   outcome van de parkeerplaats naar het bord sleept.
-- * Bestaat er al een outcome met een vergelijkbare titel, dan wordt die aangevuld
--   (alleen lege velden) in plaats van een dubbele aan te maken.
-- Veilig om opnieuw te draaien.

-- 1. Hulpfuncties (tijdelijk, alleen voor deze sessie)
create or replace function pg_temp.lace_goal(p_kind text, p_code text, p_patterns text[], p_title text, p_color int)
returns text language plpgsql as $f$
declare v text;
begin
  select id into v from public.ogsm
   where kind = p_kind and (title ilike any (p_patterns) or code = p_code or code = ltrim(p_code, '0'))
   order by (title ilike any (p_patterns)) desc, sort_order limit 1;
  if v is null then
    v := p_kind || '_' || p_code;
    insert into public.ogsm (id, kind, code, title, color, sort_order, updated_by)
    values (v, p_kind, p_code, p_title, p_color,
            coalesce((select max(sort_order) from public.ogsm where kind = p_kind), 0) + 1, 'Claude (PI 27.1)')
    on conflict (id) do nothing;
  end if;
  return v;
end $f$;

create or replace function pg_temp.lace_park(
  p_id text, p_patterns text[], p_title text, p_ogsm text, p_extra jsonb, p_cio text,
  p_hyp text, p_krs jsonb, p_contribs jsonb, p_ms jsonb)
returns text language plpgsql as $f$
declare v text; cs jsonb; m jsonb; n int := 0;
begin
  select id into v from public.outcomes
   where id = p_id or title ilike any (p_patterns)
   order by (id = p_id) desc, parked desc limit 1;

  if v is null then
    v := p_id;
    insert into public.outcomes (id, title, parked, sort_order, commitment, ogsm_ref, ogsm_extra, cio_ref,
                                 hypothesis, krs, contribs, updated_by)
    values (v, p_title, true,
            coalesce((select max(sort_order) from public.outcomes where sort_order < 1000000000), 0) + 1,
            'committed', p_ogsm, p_extra, coalesce(p_cio, ''), p_hyp, p_krs, p_contribs, 'Claude (PI 27.1)');
  else
    update public.outcomes set
      ogsm_ref   = case when ogsm_ref = '' then p_ogsm else ogsm_ref end,
      ogsm_extra = case when ogsm_extra = '[]'::jsonb then p_extra else ogsm_extra end,
      cio_ref    = case when cio_ref = '' then coalesce(p_cio, '') else cio_ref end,
      hypothesis = case when hypothesis = '' then p_hyp else hypothesis end,
      krs        = case when krs = '[]'::jsonb then p_krs else krs end,
      contribs   = case when contribs = '[]'::jsonb or contribs = '[{"id":"","owner":"","text":""}]'::jsonb then p_contribs else contribs end,
      updated_at = now(), updated_by = 'Claude (PI 27.1)'
    where id = v;
  end if;

  -- Stappen per iteratie als mijlpalen, alleen als de outcome er nog geen heeft
  if not exists (select 1 from public.milestones where row_ref = v) then
    select contribs into cs from public.outcomes where id = v;
    for m in select * from jsonb_array_elements(p_ms) loop
      n := n + 1;
      insert into public.milestones (id, row_ref, contrib_ref, iter, title, type, status, updated_by)
      values (v || '_m' || n, v,
              case when exists (select 1 from jsonb_array_elements(cs) c where c->>'id' = m->>'c') then m->>'c' else '' end,
              (m->>'i')::int, m->>'t', coalesce(m->>'type', 'learn'), 'planned', 'Claude (PI 27.1)')
      on conflict (id) do nothing;
    end loop;
  end if;
  return v;
end $f$;

-- 2. De outcomes
do $$
declare g01 text; g04 text; g05 text; c4 text;
begin
  g01 := pg_temp.lace_goal('goal', '01', array['%sturen op waarde%'],
         'Sturen op waarde en Wendbaar & Sneller', 1);
  g04 := pg_temp.lace_goal('goal', '04', array['%kansen%AI%', '%AI%productiviteit%'],
         'Benutten kansen AI', 4);
  g05 := pg_temp.lace_goal('goal', '05', array['%wendbare%professionele%'],
         'Wendbare & professionele organisatie', 2);
  c4  := pg_temp.lace_goal('cio', '4', array['%CIO Office%optimaliseren%AI%', '%optimaliseren met AI%'],
         'Een proces binnen CIO Office aantoonbaar optimaliseren met AI', 4);

  -- 1. AI-driven innovatiepipeline
  perform pg_temp.lace_park('p271_ai', array['%innovatiepipeline%', '%AI-native werken%'],
    'EDSN oefent AI-native werken: AI-driven innovatiepipeline', g04, '[]'::jsonb, c4,
    $t$Aan het einde van PI 27.1 is voor één afgebakend onderdeel van de innovatiepipeline aangetoond dat AI de kwaliteit en/of snelheid van besluitvorming verbetert. De eerste focus is óf AI-ondersteund feature refinen óf een uniforme standaard voor de discoveryfase.

Beslisgrens: nul- en eindmeting op doorlooptijd/effort én kwaliteit; minimaal 20% verbetering op één efficiëntie-indicator, zonder daling van de afgesproken kwaliteitscriteria.
Bewijsbron: timestamps en bewerkingsinspanning uit de pilot; kwaliteitsreview op volledigheid, helderheid, toetsbare outcome/hypothese en gereedheid voor besluit.
Te bevestigen: 20% en keuze feature refinement versus discovery.$t$,
    '[{"id":"k1","text":"Verbetering op één efficiëntie-indicator (doorlooptijd/effort)","kind":"lagging","start":0,"target":20,"current":0,"unit":"%"},
      {"id":"k2","text":"Afgesproken kwaliteitscriteria gehaald (geen daling)","kind":"leading","start":0,"target":100,"current":0,"unit":"%"}]'::jsonb,
    '[{"id":"c1","owner":"LACE","text":"Pilot selecteren; nulmeting werkwijze en kwaliteit; AI-workflow of discovery-standaard ontwerpen; guardrails en reviewcriteria; gebruikers begeleiden; evaluatie en schaalbesluit faciliteren"}]'::jsonb,
    '[{"i":0,"c":"c1","t":"Processtap en meetset gekozen"},
      {"i":1,"c":"c1","t":"Test met 3-5 echte features/discovery-items"},
      {"i":2,"c":"c1","t":"Vergeleken met nulmeting, feedback verzameld"},
      {"i":3,"c":"c1","t":"Besluit: stoppen, aanpassen of opschalen","type":"fixed"}]'::jsonb);

  -- 2 + 3. ART coaching (Tactisch vierkant en pilot ITF samengevoegd)
  perform pg_temp.lace_park('p271_artc', array['%ART coaching%', '%tactisch vierkant%', '%pilot ITF%'],
    'ART coaching maakt het verschil', g05, to_jsonb(array[g01]), null,
    $t$Tactisch vierkant (T4K): aan het einde van PI 27.1 handelen de deelnemende tactische vierkanten aantoonbaar meer als gezamenlijk tactisch leiderschap: zij bespreken de opgave 3-18 maanden vooruit, verbinden waarde, techniek, flow en mensen en leggen structurele besluiten vast met eigenaar en termijn.

Outcome-driven pilot ITF: aan het einde van PI 27.1 stuurt de ITF-pilot aantoonbaar op gewenste effecten in plaats van alleen op oplevering: geselecteerde PI-doelen en features bevatten een doelgroep, gewenste verandering, indicator, streefwaarde/beslisgrens en bewijsbron, en deze informatie wordt gebruikt bij minstens één prioriterings- of bijsturingsbesluit.

Bewijsbron: observaties van T4K-overleggen; besluitlog; korte pulse; signalen uit ART Sync en Inspect & Adapt; Jira/featuretemplates; PI-objectives; outcome review; korte evaluatie met PM/PO/RTE/teams.
Te bevestigen: aantal pilot-vierkanten en 80%-grens; pilotomvang 3-5 items.$t$,
    '[{"id":"k1","text":"Pilot-vierkanten die in ≥2 cycli minimaal 4 van 6 succescriteria halen","kind":"lagging","start":0,"target":2,"current":0,"unit":""},
      {"id":"k2","text":"Besluiten met eigenaar en termijn vastgelegd","kind":"leading","start":0,"target":80,"current":0,"unit":"%"},
      {"id":"k3","text":"Pilotitems ITF die voldoen aan de outcome-checklist","kind":"leading","start":0,"target":100,"current":0,"unit":"%"},
      {"id":"k4","text":"Besluiten aantoonbaar aangepast op basis van evidence","kind":"lagging","start":0,"target":1,"current":0,"unit":""}]'::jsonb,
    '[{"id":"c1","owner":"Tactisch vierkant","text":"Succesbeeld operationaliseren; startscan; per vierkant 2-3 ontwikkelpunten; coachen op echte tactische vraagstukken; werkende afspraken borgen"},
      {"id":"c2","owner":"Pilot ITF","text":"Pilotgroep en items selecteren; outcome-template en coachingritme; teams helpen hypotheses en measures scherp te maken; evidence reviews begeleiden; Way of Working vastleggen"}]'::jsonb,
    '[{"i":0,"c":"c1","t":"Gezamenlijke start en nulbeeld"},
      {"i":1,"c":"c1","t":"Focus gekozen"},
      {"i":2,"c":"c1","t":"Oefenen in echt werk"},
      {"i":3,"c":"c1","t":"Herobservatie en pulse"},
      {"i":4,"c":"c1","t":"Borgings- of vervolgkeuze","type":"fixed"},
      {"i":0,"c":"c2","t":"Nulmeting pilotitems"},
      {"i":1,"c":"c2","t":"Items geformuleerd en gereviewd"},
      {"i":2,"c":"c2","t":"Evidence verzameld"},
      {"i":3,"c":"c2","t":"Besluit genomen op evidence","type":"fixed"},
      {"i":4,"c":"c2","t":"Retrospective en WoW-borging"}]'::jsonb);

  -- 4. EDM 2.0
  perform pg_temp.lace_park('p271_edm', array['%EDM 2.0%', '%EDM2%', '%Delivery Model%'],
    'EDM 2.0 werkt in de praktijk', g05, '[]'::jsonb, null,
    $t$Aan het einde van PI 27.1 passen de afgesproken pilotgroepen EDM 2.0 toe op echte werkvraagstukken. Betrokkenen kennen en gebruiken de afgesproken rollen, verantwoordelijkheden, besluitroutes en samenwerkingsafspraken. Praktijkfeedback heeft geleid tot aantoonbare verbeteringen in het model. Eigenaarschap, beheer en een vast evaluatie- en verbeterritme zijn belegd, zodat EDM 2.0 niet alleen een document is, maar een werkend en lerend operating model.

Bewijsbron: gedeelde modelversie; casus- en besluitlog; korte gebruikersevaluaties; verbeterlog met herbeproeving; vastgelegde beheerafspraken.
Te bevestigen: pilotgroepen, casusomvang, meetgrenzen, modeleigenaar en formele doelkoppeling.$t$,
    '[{"id":"k1","text":"Praktijkcasussen met expliciete rollen, besluitroute en opvolging","kind":"lagging","start":0,"target":2,"current":0,"unit":""},
      {"id":"k2","text":"Verbeteringen doorgevoerd en opnieuw beproefd","kind":"leading","start":0,"target":1,"current":0,"unit":""}]'::jsonb,
    '[{"id":"c1","owner":"LACE","text":"Model toegankelijk delen en toelichten; toepassing begeleiden; knelpunten en feedback ophalen; verbeteringen faciliteren en opnieuw toetsen; eigenaarschap en verbeterritme helpen borgen"}]'::jsonb,
    '[{"i":0,"c":"c1","t":"Gedeeld en startbeeld bepaald"},
      {"i":1,"c":"c1","t":"Toegepast in echt werk"},
      {"i":2,"c":"c1","t":"Ervaringen en effecten geëvalueerd"},
      {"i":3,"c":"c1","t":"Verbeterd en opnieuw beproefd"},
      {"i":4,"c":"c1","t":"Beheer en eigenaarschap geborgd","type":"fixed"}]'::jsonb);

  -- 5. RTE x LACE
  perform pg_temp.lace_park('p271_rte', array['%RTE x LACE%', '%RTE%LACE%'],
    'RTE x LACE implementeert', g05, '[]'::jsonb, null,
    $t$Aan het einde van PI 27.1 werkt RTE x LACE aantoonbaar als gezamenlijk veranderplatform: voor minimaal 2 geprioriteerde ART-overstijgende WoW-vraagstukken is een gezamenlijk ontwikkelde verbetering daadwerkelijk toegepast, elk in minimaal 2 betrokken ART's. Betrokken rollen zijn voor besluitvorming betrokken en passen de afspraken toe in echt werk. Een voor/na-evaluatie toont per verbetering welk knelpunt is verminderd, of onderbouwt bijsturing wanneer effect uitblijft. Eigenaarschap, besluitroute, opvolging en borging zijn zichtbaar vastgelegd.

Missie: RTE's en LACE lossen samen vraagstukken op die meerdere ART's raken door kennis te delen, veranderingen te begeleiden en werkende verbeteringen te implementeren (visie PI 26.4).
Bewijsbron: gedeelde verbeterbacklog; startbeeld en effectmeting per vraagstuk; besluit- en actielog; praktijkvoorbeelden; feedback van betrokken rollen; evaluatie en borgingsafspraken. Bijeenkomsten zijn middel, geen succesmaat.
Te bevestigen: scope, 2 vraagstukken, minimaal 2 ART's per verbetering, effectindicatoren en mandaten.$t$,
    '[{"id":"k1","text":"ART-overstijgende verbeteringen toegepast in ≥2 ART''s","kind":"lagging","start":0,"target":2,"current":0,"unit":""},
      {"id":"k2","text":"Verbeteringen met voor/na-evaluatie en besluit (borgen, aanpassen, stoppen)","kind":"leading","start":0,"target":2,"current":0,"unit":""}]'::jsonb,
    '[{"id":"c1","owner":"LACE","text":"Samen met RTE''s vraagstukken prioriteren; rollen vroeg betrekken; experiment en implementatie begeleiden; praktijkleren tussen ART''s; effectevaluatie en besluitroute faciliteren; aansluiten op EDM 2.0"}]'::jsonb,
    '[{"i":0,"c":"c1","t":"Missie, mandaat en 2 prioriteiten bevestigd"},
      {"i":1,"c":"c1","t":"Aanpak per vraagstuk uitgewerkt"},
      {"i":2,"c":"c1","t":"Beproefd in deelnemende ART''s"},
      {"i":3,"c":"c1","t":"Gebruik en effect besproken in CoP","type":"sync"},
      {"i":4,"c":"c1","t":"Geëvalueerd en geborgd","type":"fixed"}]'::jsonb);

  -- 6. KV-nettarieven
  perform pg_temp.lace_park('p271_kv', array['%KV%tarie%', '%nettarie%'],
    'Nieuwe WoW bij KV-nettarieven met sterke businessconnectie', g01, '[]'::jsonb, null,
    $t$Aan het einde van PI 27.1 werkt het KV-tarieven initiatief voor een gezamenlijk met de netbeheerders gekozen, afgebakende keten met een eenvoudiger Way of Working. Vanuit een bevestigde externe mijlpaal is teruggeredeneerd naar kleine waardestappen met een beoogd effect, bewijsbron, eigenaar, afhankelijkheden en acceptatieafspraak met de business. Minimaal één eerste waardestap is gerealiseerd en met de betrokken netbeheerders getoetst op bruikbaarheid en bijdrage aan het beoogde effect. Business en realisatie gebruiken zichtbare flow- en waardesignalen om prioriteiten, scope of aanpak bij te sturen; besluiten en resterende onzekerheden zijn expliciet.

Bewijsbron: bevestigde externe mijlpalen en deadlines; gezamenlijke terugplanning; waardestappen/backlog; expliciete rol- en besluitafspraken; werkbord met start-, eind- en blokkadedata; businessvalidatie van de eerste waardestap; besluitlog.
Te bevestigen: externe mijlpalen/deadlines, scope, deelnemende netbeheerders, business- en realisatie-eigenaren, waardemaatstaf, baseline, WIP-grens en haalbaarheid van minimaal 2 stappen.$t$,
    '[{"id":"k1","text":"Waardestappen gerealiseerd en getoetst met netbeheerders","kind":"lagging","start":0,"target":1,"current":0,"unit":""},
      {"id":"k2","text":"Gezamenlijke bijsturingsbesluiten op waarde- of flowsignalen","kind":"leading","start":0,"target":1,"current":0,"unit":""}]'::jsonb,
    '[{"id":"c1","owner":"LACE","text":"Vraagstuk met business en netbeheerders afbakenen; terugplanning faciliteren; waardestappen en hypotheses helpen formuleren; flow, blokkades en WIP zichtbaar maken; evaluatie begeleiden. LACE faciliteert en coacht."}]'::jsonb,
    '[{"i":0,"c":"c1","t":"Mijlpaal, keten en startvraag gekozen"},
      {"i":1,"c":"c1","t":"Teruggeredeneerd naar waardestappen"},
      {"i":2,"c":"c1","t":"Eerste stap gestart met WIP-afspraak"},
      {"i":3,"c":"c1","t":"Gerealiseerde waarde getoetst","type":"release"},
      {"i":4,"c":"c1","t":"WoW geëvalueerd en besluit","type":"fixed"}]'::jsonb);
end $$;

-- 3. Controle: wat staat er nu op de parkeerplaats?
select o.title, g.code as ogsm, c.code as cio,
       jsonb_array_length(o.krs) as key_results,
       (select count(*) from public.milestones m where m.row_ref = o.id) as mijlpalen
  from public.outcomes o
  left join public.ogsm g on g.id = o.ogsm_ref
  left join public.ogsm c on c.id = o.cio_ref
 where o.parked
 order by o.sort_order;
