// Supabase Edge Function: sync-voorstellen
// Leest een transcript van de weekly sync plus de huidige stand van het bord,
// vraagt Claude om concrete wijzigingsvoorstellen en geeft die terug.
// Het bord past niets automatisch toe: het team keurt elk voorstel goed.
//
// Secrets (Supabase > Edge Functions > Secrets):
//   ANTHROPIC_API_KEY  verplicht
//   SYNC_CODE          optioneel maar aangeraden: teamcode die het bord meestuurt,
//                      zodat niet iedereen met de link API-tegoed kan verbruiken
//   ANTHROPIC_MODEL    optioneel, standaard claude-sonnet-5-5

const MAX_TRANSCRIPT = 150_000; // tekens
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-code",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

const SYSTEM = `Je bent de assistent van het LACE-team bij EDSN. Je krijgt het transcript van hun wekelijkse sync en de huidige stand van hun PI Outcome Board (outcomes met key results, mijlpalen per iteratie en taken in de planner).

Doe concrete, kleine voorstellen om het bord bij te werken op basis van wat er in de sync is gezegd. Regels:
- Stel alleen iets voor als het transcript het duidelijk onderbouwt. Twijfel je, laat het weg. Liever 5 juiste voorstellen dan 15 gokken.
- Verzin geen cijfers. Een vertrouwensscore (1-5) alleen als iemand die noemt of het overduidelijk uitspreekt ("ik zit op een drie", "dit gaat zeker lukken" = 5). Een key result-waarde alleen als het getal genoemd wordt.
- Gebruik uitsluitend id's die in de bordstand staan. Nieuwe taken krijgen geen id.
- Koppel namen uit het transcript aan de namen op het bord (eigenaren, bijdragen). Gebruik de schrijfwijze van het bord.
- Status van taken: todo (te doen), doing (bezig), waiting (wacht op iets of iemand), done (klaar). Status van mijlpalen: planned, done, risk, missed.
- Iteraties zijn kolomindexen (0 = eerste iteratie); de namen staan in de bordstand.
- Geef bij elk voorstel een kort letterlijk citaat uit het transcript als bewijs (max. 25 woorden) en schrijf toelichtingen in het Nederlands.
- Doe geen voorstellen die niets veranderen ten opzichte van de huidige stand.`;

const TOOL = {
  name: "stel_voor",
  description: "Lever de wijzigingsvoorstellen voor het bord aan.",
  input_schema: {
    type: "object",
    properties: {
      samenvatting: { type: "string", description: "Samenvatting van de sync in 2-4 zinnen, in het Nederlands." },
      voorstellen: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string", enum: ["checkin", "kr_waarde", "taak_status", "taak_nieuw", "mijlpaal_status", "leerpunt"] },
            outcome_id: { type: "string", description: "Bij checkin, kr_waarde en taak_nieuw (leeg = Run & overig)." },
            kr_id: { type: "string", description: "Bij kr_waarde." },
            waarde: { type: "number", description: "Bij kr_waarde: de nieuwe huidige waarde." },
            vertrouwen: { type: "integer", minimum: 1, maximum: 5, description: "Bij checkin." },
            notitie: { type: "string", description: "Bij checkin: korte toelichting." },
            taak_id: { type: "string", description: "Bij taak_status." },
            status: { type: "string", description: "Bij taak_status (todo/doing/waiting/done) of mijlpaal_status (planned/done/risk/missed)." },
            titel: { type: "string", description: "Bij taak_nieuw." },
            eigenaar: { type: "string", description: "Bij taak_nieuw of taak_status (nieuwe eigenaar)." },
            mijlpaal_id: { type: "string", description: "Bij mijlpaal_status, leerpunt, of optioneel bij taak_nieuw." },
            iteratie: { type: "integer", description: "Optioneel bij taak_nieuw." },
            leerpunt: { type: "string", description: "Bij leerpunt: wat er geleerd is." },
            besluit: { type: "string", enum: ["", "continue", "adjust", "stop"], description: "Bij leerpunt." },
            citaat: { type: "string", description: "Letterlijk citaat uit het transcript als bewijs." },
            toelichting: { type: "string", description: "Waarom dit voorstel, in één zin." },
          },
          required: ["type", "citaat"],
        },
      },
    },
    required: ["samenvatting", "voorstellen"],
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Alleen POST is toegestaan." }, 405);

  const code = Deno.env.get("SYNC_CODE");
  if (code && req.headers.get("x-sync-code") !== code) return json({ error: "Onjuiste teamcode." }, 401);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "ANTHROPIC_API_KEY ontbreekt in de secrets van de Edge Function." }, 500);

  let body: { transcript?: string; board?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Ongeldige aanvraag." }, 400); }
  const transcript = String(body.transcript || "").trim();
  if (transcript.length < 50) return json({ error: "Het transcript is te kort." }, 400);
  if (transcript.length > MAX_TRANSCRIPT) return json({ error: "Het transcript is te lang (max. 150.000 tekens)." }, 400);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5",
      max_tokens: 8000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "stel_voor" },
      messages: [{
        role: "user",
        content: `<bordstand>\n${JSON.stringify(body.board ?? {}, null, 1)}\n</bordstand>\n\n<transcript>\n${transcript}\n</transcript>\n\nDoe je voorstellen met de tool stel_voor.`,
      }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return json({ error: `Claude gaf een fout (${res.status}).`, detail: detail.slice(0, 500) }, 502);
  }
  const data = await res.json();
  const block = (data.content || []).find((b: { type: string }) => b.type === "tool_use");
  if (!block) return json({ error: "Geen voorstellen ontvangen." }, 502);
  return json({ samenvatting: block.input.samenvatting || "", voorstellen: block.input.voorstellen || [] });
});
