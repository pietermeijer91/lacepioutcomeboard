# LACE PI Outcome Board

Een gedeeld bord waarop het LACE-team richting PI-outcomes plant en bijhoudt hoe ver we zijn: outcomes met key results, mijlpalen per iteratie (vaste datum, leren, synchronisatie, release) en een samenvatting bovenaan. Wijzigingen zijn direct zichtbaar voor iedereen die het bord open heeft.

- **Frontend:** statische site (`index.html`, `styles.css`, `app.js`), geen build-stap.
- **Opslag en live updates:** [Supabase](https://supabase.com) (Postgres + Realtime).
- **Geen login:** iedereen met de link kan het bord bekijken en wijzigen. Zet er dus geen vertrouwelijke informatie op, en deel de link alleen binnen het team. Wie wil, vult rechtsboven zijn naam in; die verschijnt dan bij “bijgewerkt door”.

## Exporteren

Met de knop **Exporteren** boven het bord download je het bord als afbeelding (PNG) of sla je het op als PDF (via het afdrukvenster, kies ‘Opslaan als PDF’). De export toont het bord zoals je het nu ziet, zonder knoppen en zonder parkeerplaats. Klap eerst alles uit als je alle details wilt meenemen.

## Wachtwoord

Het bord vraagt een teamwachtwoord. Daarmee logt het in met één gedeeld account in Supabase; zonder wachtwoord is de data ook via de API niet te lezen. Wachtwoord wijzigen: pas in Supabase (Authentication > Users) het wachtwoord van `lacebord@example.com` aan naar `<nieuw wachtwoord>1234`.

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

### Lokaal draaien
```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Gebruik
- **Focus-weergave**: klik op een outcome om die uit te klappen; de andere outcomes tonen dan alleen kleine ruitjes. Met “Alles uitklappen” zie je alles tegelijk.
- **Eén rij per outcome**: alle mijlpalen van een outcome staan op één rij, per iteratie. Er zijn geen aparte banen per bijdrage.
- **Slepen**: sleep een mijlpaal met de muis naar een andere iteratie of outcome. Op telefoon en tablet verplaats je via het zijpaneel (Eerder/Later).
- **Afhankelijkheden**: geef in het zijpaneel van een mijlpaal aan waar hij op wacht. Het bord tekent een lijn tussen de mijlpalen; rood gestippeld als de voorganger later gepland staat of gemist is. Ga met de muis over een mijlpaal om alleen zijn lijnen uit te lichten.
- **Vandaag-lijn**: een oranje lijn markeert de huidige dag; geplande mijlpalen in een voorbije iteratie krijgen een gestippelde rand.
- **+ PI-outcome**: voeg een outcome toe en vul de key results in (start, doel, nu). De voortgang en de status (Gepland, Op koers, Aandacht, Achter, Behaald) worden berekend tegenover de verwachte voortgang op basis van de tijd in de PI.
- **+ mijlpaal** in een iteratiekolom: plan een mijlpaal en houd de status bij (gepland, gehaald, risico, gemist).
- **Hypothese** per outcome: "Wij geloven dat … leidt tot … We weten dat het werkt als …".
- **Voorlopend / achterlopend** per key result; een waarschuwing als een outcome alleen achterlopende indicatoren heeft.
- **Check-ins**: per iteratie een vertrouwensscore (1–5) met toelichting; het bord toont het verloop als lijntje.
- **Commitment en business value**: committed of stretch, BV gepland en werkelijk; bovenaan staat de predictability (werkelijk / gepland committed, doel 80–100%).
- **Leerpunten** bij mijlpalen met een besluit (doorgaan, bijsturen, stoppen); per outcome verschijnt een leerlog.
- **OGSM**: bovenaan staat de ambitie (Objective). Outcomes zijn gegroepeerd per OGSM-doel in de linkerkolom, met strategie, meetwaarde en gemiddelde voortgang, en lijnen naar de outcomes. Doelen zonder outcome en ongekoppelde outcomes worden gemeld. Beheren via PI-instellingen › OGSM; koppelen via Bewerken bij een outcome (één hoofddoel, eventueel extra doelen).
- **Outcome-check**: in het zijpaneel van een outcome vijf vragen om haalbaarheid te toetsen (invloed, termijn, meetbaar tijdens de PI, capaciteit, eerste stap), met tips op basis van het bord. Op het bord staat ‘Nog niet getoetst’, ‘Check x/5’ of ‘✓ Getoetst’.
- **CIO Office-doelen**: tweede kolom tussen OGSM-doel en outcome, met lijnen. Beheren via PI-instellingen; koppelen via Bewerken bij een outcome.
- **Parkeerplaats volgende PI**: boven het bord. Typ een item en druk op Enter om het te parkeren; sleep het naar een OGSM- of CIO Office-groep op het bord om er een PI-outcome van te maken. Via Bewerken kun je een outcome ook weer parkeren. De naam van de volgende PI stel je in bij PI-instellingen.
- **Mijlpaal snel toevoegen**: klik in een iteratie op ‘+ mijlpaal’, typ de titel en druk op Enter (Esc annuleert). Klik daarna op het kaartje voor soort en status.
- **Planner** (tab): kanban per outcome (*Te doen, Bezig, Wacht op, Klaar*) plus een rij *Run & overig*. Taken hangen aan een outcome en optioneel aan een mijlpaal; bij de mijlpaal zie je dan hoeveel taken klaar zijn. Filters *Mijn taken*, *Deze iteratie* en *Vastgelopen of te laat*, en een waarschuwing bij meer dan 3 taken tegelijk in *Bezig* per persoon.
- **Weekly sync** (tab): loop per outcome door de sync, met timer van 5 minuten, check-in, mijlpalen van nu en de volgende iteratie, en taken die vastzitten. Het laatste scherm (✓) toont wat nog openstaat: outcomes zonder check-in deze week, mijlpalen met risico en vastgelopen taken.
- **PI-instellingen**: naam van de PI, startdatum, iteratielengte, aantal iteraties en wel of geen IP-iteratie. Hier kun je ook de gegevens uit het eerdere canvas-bord plakken.

## Datamodel
| Tabel | Inhoud |
|---|---|
| `outcomes` | titel, volgorde, `krs` en `contribs` als JSON |
| `milestones` | `row_ref` (`art` of een outcome-id), `contrib_ref` (niet meer gebruikt op het bord), iteratie 0–5, titel, soort, status |
| `settings` | één rij `pi`: startdatum, iteratielengte, naam |

Bij gelijktijdig typen in hetzelfde veld wint de laatst opgeslagen wijziging.

## Samenwerken
- **Bord gebruiken:** deel de link. Wil je eerst oefenen of iets laten zien zonder het echte bord te veranderen? Gebruik de demomodus: https://pietermeijer91.github.io/lacepioutcomeboard/?demo
- **Meebouwen met Claude Code:** vraag toegang tot deze repo en open hem in Claude Code. `CLAUDE.md` vertelt Claude hoe het bord in elkaar zit en welke afspraken gelden.
- **Werkwijze:** werk op een eigen branch en open een pull request; `main` gaat direct live. Het PR-sjabloon bevat de checklist.
- **Databasewijzigingen:** altijd als nieuw, genummerd bestand in `supabase/migrations/`. Iemand met toegang tot Supabase draait het script vóórdat de pull request wordt gemerged.
- **Testen:** `index.html?demo` in de browser, of `node test/smoke.js` (Playwright) voor een snelle automatische check.
- **Ideeën en bugs:** zet ze als GitHub Issue, dan kan iemand tegen Claude Code zeggen: "pak issue #12 op".
