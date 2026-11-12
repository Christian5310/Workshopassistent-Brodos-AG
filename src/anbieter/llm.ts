import { z } from "zod";
import { config } from "../config.ts";
import { einstellungen, promptAgentenFertig } from "../einstellungen.ts";
import { store } from "../store.ts";
import { ROLLEN, type Protokoll, type Rolle } from "../types.ts";
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

const AntwortSchema = z.object({ antworten: z.array(z.object({ rolle: z.enum(ROLLEN), text: z.string().min(1) })).min(1) });

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
        { role: "system", content: `${einstellungen.promptAssistent}\n\n${FORMAT_STAND}` },
        {
          role: "user",
          content: `STAND:\n${JSON.stringify(stand)}\n\nVORHERIGER ABSCHNITT (nur zum Verständnis, bereits verarbeitet):\n${davor || "(keiner)"}\n\nABSCHNITT:\n${abschnitt}`,
        },
      ],
      8000,
    );
  }

  async expertenrunde({ frage, an, verlauf, protokoll }: ChatKontext): Promise<{ von: Rolle; text: string }[]> {
    const name = (r: Rolle) => einstellungen.agenten[r].name;
    const gefragt = an === "alle" ? [...ROLLEN] : [an];
    const letzteMinuten = store.daten.transkript.slice(-5).map((t) => t.text).join("\n");
    const format =
      `Antworte ausschließlich als JSON: {"antworten": [{"rolle": "…", "text": "…"}]}. ` +
      `Erlaubte Werte für "rolle": ${gefragt.map((r) => `"${r}" (${name(r)})`).join(", ")}. ` +
      (an === "alle" ? "Genau eine Antwort pro Rolle, je 1–3 Sätze." : "Genau eine Antwort, höchstens 6 Sätze.") +
      ` Im "text" kein Rollenname und kein Markdown.`;

    const nachrichten: Nachricht[] = [{ role: "system", content: `${promptAgentenFertig(protokoll, an)}\n\n${format}` }];
    for (const n of verlauf.slice(-20)) {
      nachrichten.push(n.von === "frage" ? { role: "user", content: n.text } : { role: "assistant", content: `${name(n.von)}: ${n.text}` });
    }
    nachrichten.push({
      role: "user",
      content: `${letzteMinuten ? `Zuletzt im Raum gesagt (Transkript, ohne Sprecher):\n${letzteMinuten}\n\n` : ""}Frage${an === "alle" ? "" : ` an ${name(an)}`}: ${frage}`,
    });

    const geprueft = AntwortSchema.parse(await this.#frage(nachrichten, 1200));
    return geprueft.antworten.filter((a) => gefragt.includes(a.rolle)).map((a) => ({ von: a.rolle, text: a.text.trim() }));
  }
}
