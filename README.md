# LACE PI Outcome Board

Een gedeeld bord waarop het LACE-team richting PI-outcomes plant en bijhoudt hoe ver we zijn: outcomes met key results en bijdragen, mijlpalen per iteratie (vaste datum, leren, synchronisatie, release) en een samenvatting bovenaan. Wijzigingen zijn direct zichtbaar voor iedereen die het bord open heeft.

- **Frontend:** statische site (`index.html`, `styles.css`, `app.js`), geen build-stap.
- **Opslag en live updates:** [Supabase](https://supabase.com) (Postgres + Realtime).
- **Geen login:** iedereen met de link kan het bord bekijken en wijzigen. Zet er dus geen vertrouwelijke informatie op, en deel de link alleen binnen het team. Wie wil, vult rechtsboven zijn naam in; die verschijnt dan bij “bijgewerkt door”.

## Installeren

### 1. Supabase-project
1. Maak een project aan op supabase.com (de gratis tier is genoeg).
2. Open **SQL Editor**, plak `supabase/schema.sql` en kies **Run**.
3. Al een eerdere versie geïnstalleerd? Voer dan ook de bestanden in `supabase/migrations/` uit, op volgorde.
4. Optioneel: voer `supabase/seed.sql` uit voor de startinhoud (placeholders en de vaste PI-events).

### 2. Configuratie
Vul `config.js` met de **Project URL** en de **anon public key** (Project Settings > API). Deze sleutel staat zichtbaar in de pagina; omdat er geen login is, kan iedereen met de link en deze sleutel het bord lezen en wijzigen. Gebruik nooit de `service_role`-key in de frontend.

### 3. Publiceren
Zet het bord op een statische host, bijvoorbeeld **GitHub Pages**: Settings > Pages > Deploy from a branch > `main` / root. Het bord staat dan op `https://pietermeijer91.github.io/lacepioutcomeboard/`. Andere opties zijn Azure Static Web Apps, Netlify of een interne webserver.

### 4. Sync verwerken activeren (optioneel)
Deze functie gebruikt de Claude API via een Supabase Edge Function, zodat de API-sleutel geheim blijft.
1. Maak een API-sleutel aan op https://console.anthropic.com (API Keys). Kosten: enkele centen per verwerkte sync.
2. Supabase > **Edge Functions** > **Deploy a new function** > **Via Editor**. Naam: `sync-voorstellen`. Plak de inhoud van `supabase/functions/sync-voorstellen/index.ts` en kies **Deploy**.
3. Supabase > **Edge Functions** > **Secrets**: voeg toe
   - `ANTHROPIC_API_KEY` = je API-sleutel
   - `SYNC_CODE` = een zelfgekozen teamcode (aanrader: zonder code kan iedereen met de link je API-tegoed gebruiken)
   - optioneel `ANTHROPIC_MODEL` (standaard `claude-sonnet-5-5`)
4. Vul in de tab *Sync verwerken* eenmalig de teamcode in; je browser onthoudt hem.

Met de Supabase CLI kan het ook: `supabase functions deploy sync-voorstellen` en `supabase secrets set ANTHROPIC_API_KEY=… SYNC_CODE=…`.

Let op privacy: het transcript gaat naar de API van Anthropic. Stem af met IT/privacy of dat past binnen jullie beleid, en kondig opnemen en transcriberen aan in de sync.

### Lokaal draaien
```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Gebruik
- **Focus-weergave**: klik op een outcome om die uit te klappen; de andere outcomes tonen dan alleen kleine ruitjes. Met “Alles uitklappen” zie je alles tegelijk.
- **Banen per bijdrage**: elke bijdrage (wie/team) van een outcome krijgt een eigen baan. Een mijlpaal koppel je aan een bijdrage via “Bijdrage (baan)”.
- **Slepen**: sleep een mijlpaal met de muis naar een andere iteratie, baan of outcome. Op telefoon en tablet verplaats je via het zijpaneel (Eerder/Later, Bijdrage).
- **Vandaag-lijn**: een oranje lijn markeert de huidige dag; geplande mijlpalen in een voorbije iteratie krijgen een gestippelde rand.
- **+ PI-outcome**: voeg een outcome toe en vul de key results in (start, doel, nu). De voortgang en de status (Gepland, Op koers, Aandacht, Achter, Behaald) worden berekend tegenover de verwachte voortgang op basis van de tijd in de PI.
- **+ mijlpaal** in een iteratiekolom: plan een mijlpaal en houd de status bij (gepland, gehaald, risico, gemist).
- **Hypothese** per outcome: "Wij geloven dat … leidt tot … We weten dat het werkt als …".
- **Voorlopend / achterlopend** per key result; een waarschuwing als een outcome alleen achterlopende indicatoren heeft.
- **Check-ins**: per iteratie een vertrouwensscore (1–5) met toelichting; het bord toont het verloop als lijntje.
- **Commitment en business value**: committed of stretch, BV gepland en werkelijk; bovenaan staat de predictability (werkelijk / gepland committed, doel 80–100%).
- **Leerpunten** bij mijlpalen met een besluit (doorgaan, bijsturen, stoppen); per outcome verschijnt een leerlog.
- **Planner** (tab): kanban per outcome (*Te doen, Bezig, Wacht op, Klaar*) plus een rij *Run & overig*. Taken hangen aan een outcome en optioneel aan een mijlpaal; bij de mijlpaal zie je dan hoeveel taken klaar zijn. Filters *Mijn taken*, *Deze iteratie* en *Vastgelopen of te laat*, en een waarschuwing bij meer dan 3 taken tegelijk in *Bezig* per persoon.
- **Weekly sync** (tab): loop per outcome door de sync, met timer van 5 minuten, check-in, mijlpalen van nu en de volgende iteratie, en taken die vastzitten. Het laatste scherm (✓) toont wat nog openstaat: outcomes zonder check-in deze week, mijlpalen met risico en vastgelopen taken.
- **Sync verwerken** (tab): plak of upload het Teams-transcript van de sync (.vtt of tekst). Claude doet voorstellen (check-ins, key result-waarden, taakstatus, nieuwe taken, mijlpaalstatus, leerpunten), elk met een citaat als bewijs. Je vinkt aan wat klopt en past het toe; zonder goedkeuring verandert er niets.
- **PI-instellingen**: naam van de PI, startdatum, iteratielengte, aantal iteraties en wel of geen IP-iteratie. Hier kun je ook de gegevens uit het eerdere canvas-bord plakken.

## Datamodel
| Tabel | Inhoud |
|---|---|
| `outcomes` | titel, volgorde, `krs` en `contribs` als JSON |
| `milestones` | `row_ref` (`art` of een outcome-id), `contrib_ref` (de bijdrage/baan), iteratie 0–5, titel, soort, status |
| `settings` | één rij `pi`: startdatum, iteratielengte, naam |

Bij gelijktijdig typen in hetzelfde veld wint de laatst opgeslagen wijziging.

## Samenwerken
- **Bord gebruiken:** deel de link. Wil je eerst oefenen of iets laten zien zonder het echte bord te veranderen? Gebruik de demomodus: https://pietermeijer91.github.io/lacepioutcomeboard/?demo
- **Meebouwen met Claude Code:** vraag toegang tot deze repo en open hem in Claude Code. `CLAUDE.md` vertelt Claude hoe het bord in elkaar zit en welke afspraken gelden.
- **Werkwijze:** werk op een eigen branch en open een pull request; `main` gaat direct live. Het PR-sjabloon bevat de checklist.
- **Databasewijzigingen:** altijd als nieuw, genummerd bestand in `supabase/migrations/`. Iemand met toegang tot Supabase draait het script vóórdat de pull request wordt gemerged.
- **Testen:** `index.html?demo` in de browser, of `node test/smoke.js` (Playwright) voor een snelle automatische check.
- **Ideeën en bugs:** zet ze als GitHub Issue, dan kan iemand tegen Claude Code zeggen: "pak issue #12 op".
