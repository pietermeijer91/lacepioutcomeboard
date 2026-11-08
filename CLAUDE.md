# LACE PI Outcome Board — instructies voor Claude Code

Gedeeld planningsbord van het LACE-team (het bord gaat over het LACE zelf, niet over een ART): PI-outcomes gekoppeld aan OGSM-doelen, met key results, bijdragen (banen) en mijlpalen per iteratie, plus check-ins, business value en leerpunten. Gebaseerd op het SAFe PI Outcome Planning Board.

Live: https://pietermeijer91.github.io/lacepioutcomeboard/ — alles wat op `main` staat gaat via GitHub Pages direct live.

## Opbouw
- **Geen build-stap, geen framework.** `index.html` (opmaak), `styles.css`, `app.js` (alle logica, vanilla JS in één IIFE), `config.js` (Supabase-URL en anon key).
- **Supabase** (Postgres + Realtime) via de UMD-build van `@supabase/supabase-js@2.45.4` van jsDelivr. **Geen login**: de policies staan `anon` lezen en schrijven toe. De anon key in `config.js` is dus openbaar; zet nooit een `service_role`-key in de code.
- **Datamodel** (zie `supabase/schema.sql`):
  - `outcomes`: titel, `sort_order`, `hypothesis`, `commitment` (`committed`/`stretch`), `bv_planned`, `bv_actual`, en JSON-velden `krs` (`{id,text,kind,start,target,current,unit}`), `contribs` (`{id,owner,text}`), `checkins` (`{id,date,confidence,note,by}`), `checks` (outcome-check: `{invloed,termijn,meetbaar,capaciteit,eerstestap}` als booleans; vragen in `OCHECK`).
  - `milestones`: `row_ref` (`art` = de rij LACE-ritme, of een outcome-id), `contrib_ref` (bijdrage-id, `''` = hele outcome), `iter` (kolomindex), `type` (`fixed`/`learn`/`sync`/`release`), `status` (`planned`/`done`/`risk`/`missed`), `learning`, `decision`, `depends_on` (lijst met mijlpaal-id's; getekend als lijnen door `drawDeps()` in een SVG-laag over het bord, rood gestippeld als de voorganger later staat of gemist is).
  - `tasks` (planner): `title`, `outcome_ref` (`''` = Run & overig), `milestone_ref`, `owner`, `status` (`todo`/`doing`/`waiting`/`done`), `iter` (null = geen), `checklist` (`{id,text,done}`), `notes`, `sort_order`. Wordt apart geladen (`loadTasks`) met een eigen realtime-kanaal; ontbreekt de tabel, dan toont de Planner een melding en werkt de rest gewoon.
  - `ogsm`: OGSM van het LACE-team. Eén rij `id = 'objective'` (`kind = 'objective'`, de ambitie) en rijen met `kind = 'goal'` (`code`, `title`, `strategy`, `measure`, `color` 1-6, `sort_order`). Outcomes verwijzen met `ogsm_ref` (hoofddoel) en `ogsm_extra` (extra doelen). Het bord groepeert outcomes per doel in een linkerkolom (`ogsmGroups`), met lijnen in `drawDeps()`. Wordt apart geladen (`loadOgsm`); ontbreekt de tabel, dan werkt de rest gewoon.
  - `settings`: één rij `id = 'pi'` met startdatum, iteratielengte, aantal iteraties, IP-iteratie, naam.
- In `app.js` heten velden camelCase; `KEYMAP` vertaalt naar de snake_case-kolommen (`toRow`/`fromRow`). Nieuwe kolom met een andere naam? Voeg hem toe aan `KEYMAP`.
- Schrijven gaat via `queue(col, id, patch, delay)` (optimistisch lokaal bijwerken, daarna debounced `update`). Realtime-events en `loadAll()` leggen openstaande wijzigingen eroverheen (`overlay`), zodat typen niet wordt overschreven.
- Drie weergaven via tabs en de URL-hash: Outcome Board (standaard), `#planner` en `#sync`. `renderViews()` tekent de actieve weergave; gebruik die in plaats van `renderBoard()` na een wijziging.
- Weergave: `renderBoard()` bouwt het bord als HTML-string; het zijpaneel (`buildDrawer`/`syncDrawer`) wordt apart bijgewerkt zodat focus en cursor behouden blijven.

## Afspraken
- **Alle tekst in de interface is Nederlands**, kort en concreet. Termen uit SAFe (PI, ART, IP-iteratie, Inspect & Adapt, business value, predictability) blijven zoals ze zijn.
- **Kleuren alleen via de tokens** bovenaan `styles.css`, met waarden voor licht én donker thema (drie blokken: `:root`, `prefers-color-scheme: dark`, `[data-theme="dark"]`). Geen losse hex-waarden in componenten.
- Escapen: alle gebruikersdata die in HTML terechtkomt gaat door `esc()`.
- Toegankelijk: echte `<button>`s, `aria-label` op icoonknoppen, klikdoelen ±44px waar het kan.
- Klassenamen controleren op botsingen (eerder brak `.ghost` de knoppen `.btn.ghost`).

## Databasewijzigingen
1. Maak een nieuw, genummerd bestand in `supabase/migrations/` (bijv. `005_….sql`) met `add column if not exists` e.d., zodat het veilig opnieuw kan draaien.
2. Werk ook `supabase/schema.sql` bij, zodat een nieuwe installatie meteen goed is.
3. Voeg in `check()` in `app.js` een herkenbare foutmelding toe die naar de migratie verwijst.
4. **De migratie moet in Supabase gedraaid zijn vóór de code op `main` komt**, anders krijgt het hele team foutmeldingen bij opslaan. Zet dit expliciet in de pull request.

## Testen
- Open `index.html?demo` (lokaal of op de live site): Supabase wordt dan vervangen door voorbeelddata in het geheugen (`test/demo-data.js`). Niets wordt opgeslagen. Breid de demodata uit als je nieuwe velden toevoegt.
- `node test/smoke.js` draait een snelle browsertest in demomodus (laden, outcome bewerken, check-in, outcome toevoegen, slepen, geen JS-fouten). `--shot` maakt `test/screenshot.png`. Vereist Playwright (`npm i -D playwright && npx playwright install chromium`).
- Draai minimaal `node --check app.js` en de smoke-test vóór je een pull request maakt, en voeg een check toe aan `test/smoke.js` voor nieuwe functies.

## Werkwijze
- Werk op een eigen branch en open een pull request naar `main`; push niet direct naar `main`.
- Commitberichten en PR-beschrijvingen in het Nederlands.
