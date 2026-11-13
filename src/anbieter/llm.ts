import { z } from "zod";
import { config } from "../config.ts";
import { einstellungen, promptAgentenFertig } from "../einstellungen.ts";
import { store } from "../store.ts";
import type { Protokoll } from "../types.ts";
import type { ChatKontext, Sprachmodell } from "./schnittstellen.ts";

type Nachricht = { role: "system" | "user" | "assistant"; content: string };

const FORMAT_STAND = `Format von STAND (genau diese Felder, IDs bestehender Einträge unverändert lassen; neue Einträge bekommen eine neue ID):
{
  "agenda": [{"id": "A1", "titel": "…", "status": "offen|läuft|erledigt"}],
  "todos": [{"id": "T1", "text": "…", "owner": "offen", "frist": "offen", "status": "offen|erledigt", "agendapunkt": "A1"}],
  "vorschlaege": [{"id": "V1", "text": "…", "owner": "offen", "frist": "offen", "agendapunkt": "A1"}],
  "entscheidungen": [{"id": "E1", "text": "…", "agendapunkt": "A1"}],
  "offene_fragen": [{"id": "F1", "text": "…", "status": "offen|beantwortet"}],
  "notizen": [{"agendapunkt": "A1", "text": "…"}]
}`;

/** Anleitung für Sprachbefehle. Greift nur, wenn im Abschnitt das Aktivierungswort fällt (der Server prüft das zusätzlich). */
function sprachbefehle(): string {
  const wort = einstellungen.aktivierungswort;
  const agenten = einstellungen.agenten.map((a) => `"${a.id}" (${a.name})`).join(", ");
  return `Zusätzlich zu den Feldern von STAND gibst du zwei weitere Felder zurück. Fülle sie NUR, wenn im ABSCHNITT jemand ausdrücklich "${wort}" anspricht; sonst "befehle": [] und "frage": null.
- "befehle": Änderungen an bestehenden Einträgen, die "${wort}" ausdrücklich aufgetragen werden.
  Löschen ("${wort}, lösche das To-do …"): {"aktion": "loeschen", "id": "T3"}
  Ändern ("${wort}, ändere beim To-do … die Frist auf Montag"): {"aktion": "aendern", "id": "T3", "text": "…", "owner": "…", "frist": "…"} – nur die Felder angeben, die sich ändern.
  Nimm die ID des gemeinten Eintrags aus STAND. Ist nicht eindeutig, welcher Eintrag gemeint ist: kein Befehl.
- "frage": wenn "${wort}" eine Frage an die Spezial-Agenten weitergeben soll ("${wort}, Frage an …: …", "${wort}, was sagen die Experten zu …").
  Format: {"an": "alle", "text": "die Frage als ganzer Satz"}. Für "an" ist erlaubt: "alle" oder ${agenten}.
"${wort}, To-do für …", "${wort}, notiere …" und "${wort}, hake … ab" sind keine Befehle in diesem Sinn: Sie ändern wie bisher direkt den STAND.`;
}

const AntwortSchema = z.object({ antworten: z.array(z.object({ rolle: z.string(), text: z.string().min(1) })).min(1) });

/**
 * Sprachmodell über eine OpenAI-kompatible Chat-Schnittstelle.
 * Passt für Mistral (/v1/chat/completions) und Broki/Open WebUI (/api/chat/completions) – nur die .env unterscheidet sich.
 */
export class OpenAiKompatiblesSprachmodell implements Sprachmodell {
  async #frage(nachrichten: Nachricht[], maxTokens: number): Promise<unknown> {
    const antwort = await fetch(config.llm.basisUrl + config.llm.pfad, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.llm.schluessel}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: config.llm.modell, messages: nachrichten, temperature: 0.2, max_tokens: maxTokens, response_format: { type: "json_object" } }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!antwort.ok) throw new Error(`Sprachmodell: HTTP ${antwort.status} ${(await antwort.text()).slice(0, 300)}`);
    const daten = (await antwort.json()) as { choices?: { message?: { content?: string } }[] };
    return JSON.parse(daten.choices?.[0]?.message?.content ?? "");
  }

  async chronist(stand: Protokoll, abschnitt: string): Promise<unknown> {
    // Der vorherige Abschnitt geht als Kontext mit, damit Zusagen an der Schnittkante nicht verloren gehen.
    const davor = store.daten.transkript.at(-2)?.text ?? "";
    return this.#frage(
      [
        { role: "system", content: `${einstellungen.promptAssistent}\n\n${FORMAT_STAND}\n\n${sprachbefehle()}` },
        {
          role: "user",
          content: `STAND:\n${JSON.stringify(stand)}\n\nAKTUELLER AGENDAPUNKT: ${stand.agenda.find((a) => a.status === "läuft")?.titel ?? "(keiner ausgewählt)"}\n\nVORHERIGER ABSCHNITT (nur zum Verständnis, bereits verarbeitet):\n${davor || "(keiner)"}\n\nABSCHNITT:\n${abschnitt}`,
        },
      ],
      8000,
    );
  }

  async expertenrunde({ frage, an, verlauf }: ChatKontext): Promise<{ von: string; text: string }[]> {
    const gefragt = einstellungen.agenten.filter((a) => an === "alle" || a.id === an);
    const name = (id: string) => einstellungen.agenten.find((a) => a.id === id)?.name ?? "Agent";
    const letzteMinuten = store.daten.transkript.slice(-5).map((t) => t.text).join("\n");
    const format =
      `Antworte ausschließlich als JSON: {"antworten": [{"rolle": "…", "text": "…"}]}. ` +
      `Erlaubte Werte für "rolle": ${gefragt.map((a) => `"${a.id}" (${a.name})`).join(", ")}. ` +
      (an === "alle" ? "Genau eine Antwort pro Rolle, je 1–3 Sätze." : "Genau eine Antwort, höchstens 6 Sätze.") +
      ` Im "text" kein Rollenname und kein Markdown.`;

    const nachrichten: Nachricht[] = [{ role: "system", content: `${promptAgentenFertig(store.daten, an)}\n\n${format}` }];
    for (const n of verlauf.slice(-20)) {
      nachrichten.push(n.von === "frage" ? { role: "user", content: n.text } : { role: "assistant", content: `${name(n.von)}: ${n.text}` });
    }
    nachrichten.push({
      role: "user",
      content: `${letzteMinuten ? `Zuletzt im Raum gesagt (Transkript, ohne Sprecher):\n${letzteMinuten}\n\n` : ""}Frage${an === "alle" ? "" : ` an ${name(an)}`}: ${frage}`,
    });

    const geprueft = AntwortSchema.parse(await this.#frage(nachrichten, 1200));
    return geprueft.antworten.filter((a) => gefragt.some((g) => g.id === a.rolle)).map((a) => ({ von: a.rolle, text: a.text.trim() }));
  }
}
