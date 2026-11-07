# LACE PI Outcome-bord

Een gedeeld bord waarop het LACE-team richting PI-outcomes plant en bijhoudt hoe ver we zijn: outcomes met key results en bijdragen, mijlpalen per iteratie (vaste datum, leren, synchronisatie, release) en een samenvatting bovenaan. Wijzigingen zijn direct zichtbaar voor iedereen die het bord open heeft.

- **Frontend:** statische site (`index.html`, `styles.css`, `app.js`), geen build-stap.
- **Opslag, live updates en login:** [Supabase](https://supabase.com) (Postgres + Realtime + inloggen met een e-maillink).

## Installeren

### 1. Supabase-project
1. Maak een project aan op supabase.com (de gratis tier is genoeg).
2. Open **SQL Editor**, plak `supabase/schema.sql` en kies **Run**.
   - Controleer eerst in de functie `board_allowed()` het e-maildomein (standaard `@edsn.nl`). Alleen mensen met een adres op dat domein kunnen lezen en schrijven.
3. Optioneel: voer `supabase/seed.sql` uit voor de startinhoud (placeholders en de vaste PI-events).
4. Ga naar **Authentication > URL Configuration** en zet de **Site URL** (en eventueel extra Redirect URLs) op het adres waar het bord komt te staan, bijvoorbeeld `https://pietermeijer91.github.io/lacepioutcomeboard/`.

### 2. Configuratie
Vul `config.js` met de **Project URL** en de **anon public key** (Project Settings > API). Deze sleutel mag openbaar zijn; de toegang loopt via de inlog en de policies uit `schema.sql`. Gebruik nooit de `service_role`-key in de frontend.

### 3. Publiceren
Zet het bord op een statische host, bijvoorbeeld **GitHub Pages**: Settings > Pages > Deploy from a branch > `main` / root. Andere opties zijn Azure Static Web Apps, Netlify of een interne webserver.

### Lokaal draaien
```bash
python3 -m http.server 8000
# open http://localhost:8000 en voeg die URL toe als Redirect URL in Supabase
```

## Gebruik
- **+ PI-outcome**: voeg een outcome toe en vul de key results in (start, doel, nu). De voortgang en de status (Gepland, Op koers, Aandacht, Achter, Behaald) worden berekend tegenover de verwachte voortgang op basis van de tijd in de PI.
- **+ mijlpaal** in een iteratiekolom: plan een mijlpaal en houd de status bij (gepland, gehaald, risico, gemist).
- **PI-instellingen**: naam van de PI, startdatum en iteratielengte. Hier kun je ook de gegevens uit het eerdere canvas-bord plakken.

## Datamodel
| Tabel | Inhoud |
|---|---|
| `outcomes` | titel, volgorde, `krs` en `contribs` als JSON |
| `milestones` | `row_ref` (`art` of een outcome-id), iteratie 0–5, titel, soort, status |
| `settings` | één rij `pi`: startdatum, iteratielengte, naam |

Bij gelijktijdig typen in hetzelfde veld wint de laatst opgeslagen wijziging.
