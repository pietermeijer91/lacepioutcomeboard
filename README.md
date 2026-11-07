# LACE PI Outcome-bord

Een gedeeld bord waarop het LACE-team richting PI-outcomes plant en bijhoudt hoe ver we zijn: outcomes met key results en bijdragen, mijlpalen per iteratie (vaste datum, leren, synchronisatie, release) en een samenvatting bovenaan. Wijzigingen zijn direct zichtbaar voor iedereen die het bord open heeft.

- **Frontend:** statische site (`index.html`, `styles.css`, `app.js`), geen build-stap.
- **Opslag en live updates:** [Supabase](https://supabase.com) (Postgres + Realtime).
- **Geen login:** iedereen met de link kan het bord bekijken en wijzigen. Zet er dus geen vertrouwelijke informatie op, en deel de link alleen binnen het team. Wie wil, vult rechtsboven zijn naam in; die verschijnt dan bij “bijgewerkt door”.

## Installeren

### 1. Supabase-project
1. Maak een project aan op supabase.com (de gratis tier is genoeg).
2. Open **SQL Editor**, plak `supabase/schema.sql` en kies **Run**.
3. Al een eerdere versie geïnstalleerd? Voer dan ook `supabase/migrations/002_bijdrage_koppeling.sql` uit.
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
- **Banen per bijdrage**: elke bijdrage (wie/team) van een outcome krijgt een eigen baan. Een mijlpaal koppel je aan een bijdrage via “Bijdrage (baan)”.
- **Vandaag-lijn**: een oranje lijn markeert de huidige dag; geplande mijlpalen in een voorbije iteratie krijgen een gestippelde rand.
- **+ PI-outcome**: voeg een outcome toe en vul de key results in (start, doel, nu). De voortgang en de status (Gepland, Op koers, Aandacht, Achter, Behaald) worden berekend tegenover de verwachte voortgang op basis van de tijd in de PI.
- **+ mijlpaal** in een iteratiekolom: plan een mijlpaal en houd de status bij (gepland, gehaald, risico, gemist).
- **PI-instellingen**: naam van de PI, startdatum en iteratielengte. Hier kun je ook de gegevens uit het eerdere canvas-bord plakken.

## Datamodel
| Tabel | Inhoud |
|---|---|
| `outcomes` | titel, volgorde, `krs` en `contribs` als JSON |
| `milestones` | `row_ref` (`art` of een outcome-id), `contrib_ref` (de bijdrage/baan), iteratie 0–5, titel, soort, status |
| `settings` | één rij `pi`: startdatum, iteratielengte, naam |

Bij gelijktijdig typen in hetzelfde veld wint de laatst opgeslagen wijziging.
