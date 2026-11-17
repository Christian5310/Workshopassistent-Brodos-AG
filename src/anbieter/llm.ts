import { arbeitsstand } from "../delta.ts";
import { z } from "zod";
import { repariereJson } from "./json-reparatur.ts";
import { config } from "../config.ts";
import { agentenFuer, einstellungen, promptAgentenFertig } from "../einstellungen.ts";
import { store } from "../store.ts";
import type { Protokoll } from "../types.ts";
import type { ChatKontext, Sprachmodell } from "./schnittstellen.ts";

type Nachricht = { role: "system" | "user" | "assistant"; content: string };

const FORMAT_STAND = `STAND enthält nur den laufenden Agendapunkt vollständig. "uebrige_offene_todos" sind offene To-dos anderer Punkte (nur für Befehle und zum Abhaken).

Antwortformat (genau diese Felder; leere Listen, wenn nichts Neues):
{
  "neu": {
    "todos": [{"text": "…", "owner": "offen", "frist": "offen"}],
    "vorschlaege": [{"text": "…", "owner": "offen", "frist": "offen"}],
    "entscheidungen": [{"text": "…"}],
    "offene_fragen": [{"text": "…"}],
    "notizen": [{"text": "…"}]
  },
  "erledigt": ["T3"],
  "beantwortet": ["F2"],
  "befehle": [],
  "frage": null
}
- "neu": nur Einträge, die in diesem ABSCHNITT neu entstehen. Nichts aus STAND wiederholen.
- "erledigt": IDs von To-dos (aus STAND oder uebrige_offene_todos), die laut ABSCHNITT abgeschlossen sind.
- "beantwortet": IDs offener Fragen, die im ABSCHNITT beantwortet werden.`;

/** Technischer Teil des Transkriptionsassistenten: gehört zur App, nicht zur Prompt-Pflege (sonst bricht das Format). */
const TECHNIK_PROTOKOLL = "Gib NICHT den ganzen STAND zurück, sondern nur die Änderungen im folgenden Antwortformat. Das gilt auch, wenn deine Rollenbeschreibung etwas anderes sagt. Unklarer Abschnitt oder nichts Neues: alle Listen leer. Nur JSON, kein Text davor oder danach.";

/** Anleitung für Sprachbefehle. Greift nur, wenn im Abschnitt das Aktivierungswort fällt (der Server prüft das zusätzlich). */
function sprachbefehle(): string {
  const wort = einstellungen.aktivierungswort;
  const agenten = agentenFuer(store.daten.agenten).map((a) => `"${a.id}" (${a.name})`).join(", ");
  return `Zu den Feldern "befehle" und "frage": Fülle sie NUR, wenn im ABSCHNITT jemand ausdrücklich "${wort}" anspricht; sonst "befehle": [] und "frage": null.
- "befehle": Änderungen an bestehenden Einträgen, die "${wort}" ausdrücklich aufgetragen werden.
  Löschen ("${wort}, lösche das To-do …"): {"aktion": "loeschen", "id": "T3"}
  Ändern ("${wort}, ändere beim To-do … die Frist auf Montag"): {"aktion": "aendern", "id": "T3", "text": "…", "owner": "…", "frist": "…"} – nur die Felder angeben, die sich ändern.
  Nimm die ID des gemeinten Eintrags aus STAND oder uebrige_offene_todos. Ist nicht eindeutig, welcher Eintrag gemeint ist: kein Befehl.
- "frage": wenn "${wort}" eine Frage an die Spezial-Agenten weitergeben soll ("${wort}, Frage an …: …", "${wort}, was sagen die Experten zu …").
  Format: {"an": "alle", "text": "die Frage als ganzer Satz"}. Für "an" ist erlaubt: "alle" oder ${agenten}.
"${wort}, To-do für …", "${wort}, notiere …" und "${wort}, hake … ab" sind keine Befehle in diesem Sinn: Sie kommen unter "neu" bzw. "erledigt".`;
}

const AntwortSchema = z.object({ antworten: z.array(z.object({ rolle: z.string(), text: z.string().min(1) })).min(1) });

/** Je Modell gemerkt, welche Parameter es ablehnt (siehe #frage). */
const modellAnpassungen: Record<string, { ohneTemperatur: boolean; maxCompletion: boolean; ohneDenktiefe?: boolean; ohneJsonModus?: boolean }> = {};

/**
 * Liest JSON aus der Antwort, auch wenn ein Modell es in einen Code-Block (```json … ```) packt
 * oder einen Satz davor schreibt (kommt über Broki/Open WebUI je nach Modell vor).
 */
/** Das Modell hat geantwortet, aber kein brauchbares JSON geliefert (dann lohnt eine zweite Anfrage). */
export class UngueltigesJson extends Error {}

export function leseJson(text: string): unknown {
  const roh = text.trim();
  try {
    return JSON.parse(roh);
  } catch {
    const block = roh.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim();
    const von = roh.indexOf("{");
    const kandidat = block ?? (von >= 0 ? roh.slice(von) : roh);
    try {
      return JSON.parse(kandidat.slice(0, kandidat.lastIndexOf("}") + 1) || kandidat);
    } catch {
      // Kleine Fehler (unmaskierte Anführungszeichen, Kommas, abgeschnittenes Ende) reparieren
      try {
        return JSON.parse(repariereJson(kandidat));
      } catch {
        throw new UngueltigesJson(`Antwort ist kein gültiges JSON (${roh.length} Zeichen): ${roh.slice(0, 120)}`);
      }
    }
  }
}

/**
 * Ollama schneidet zu lange Eingaben stillschweigend vorne ab. Deshalb wird die Kontextlänge je Anfrage passend gesetzt:
 * grob 1 Token je 3 Zeichen plus Platz für die Antwort, mindestens LLM_KONTEXT, höchstens LLM_KONTEXT_MAX.
 */
function kontextFuer(nachrichten: Nachricht[], maxTokens: number): number {
  const geschaetzt = Math.ceil(nachrichten.reduce((summe, n) => summe + n.content.length, 0) / 3) + maxTokens + 1000;
  return Math.min(Math.max(config.llm.kontext, Math.ceil(geschaetzt / 4096) * 4096), config.llm.kontextMax);
}

/**
 * Sprachmodell über eine OpenAI-kompatible Chat-Schnittstelle.
 * Passt für Mistral (/v1/chat/completions) und Broki/Open WebUI (/api/chat/completions) – nur die .env unterscheidet sich.
 */
export class OpenAiKompatiblesSprachmodell implements Sprachmodell {
  async #frage(nachrichten: Nachricht[], maxTokens: number, modell = config.llm.modell, zeitlimitMs = 60_000, nochmal = true): Promise<unknown> {
    // Lokal dauert alles länger: kurze Aufgaben (Merlin) bekommen 30 s, alle anderen das eingestellte Zeitlimit
    if (config.llm.anbieter === "ollama") return this.#frageOllama(nachrichten, maxTokens, modell, zeitlimitMs < 10_000 ? 30_000 : Math.max(zeitlimitMs, config.llm.zeitlimitMs));
    // Neuere Modelle (z. B. gpt-6-luna über Broki) lehnen eigene temperature-Werte oder max_tokens ab.
    // Dann wird die Anfrage einmal angepasst wiederholt und die Anpassung je Modell gemerkt.
    const anpassung = (modellAnpassungen[modell] ??= { ohneTemperatur: false, maxCompletion: false });
    let antwort: Response | null = null;
    for (let versuch = 0; versuch < 5; versuch++) {
      const body: Record<string, unknown> = { model: modell, messages: nachrichten };
      if (!anpassung.ohneJsonModus) body.response_format = { type: "json_object" };
      if (!anpassung.ohneTemperatur) body.temperature = 0.2;
      if (config.llm.denktiefe && !anpassung.ohneDenktiefe) body.reasoning_effort = config.llm.denktiefe;
      body[anpassung.maxCompletion ? "max_completion_tokens" : "max_tokens"] = maxTokens;
      antwort = await fetch(config.llm.basisUrl + config.llm.pfad, {
        method: "POST",
        headers: { Authorization: `Bearer ${config.llm.schluessel}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(zeitlimitMs),
      });
      if (antwort.status !== 400) break;
      const fehler = await antwort.clone().text();
      if (!anpassung.ohneTemperatur && /temperature/i.test(fehler)) anpassung.ohneTemperatur = true;
      else if (!anpassung.maxCompletion && /max_tokens|max_completion_tokens/i.test(fehler)) anpassung.maxCompletion = true;
      else if (!anpassung.ohneDenktiefe && /reasoning_effort/i.test(fehler)) anpassung.ohneDenktiefe = true;
      else if (!anpassung.ohneJsonModus && /response_format/i.test(fehler)) anpassung.ohneJsonModus = true; // z. B. Claude über Broki
      else break;
      console.log(`Sprachmodell ${modell}: Parameter angepasst (${JSON.stringify(anpassung)}).`);
    }
    if (!antwort!.ok) throw new Error(`Sprachmodell: HTTP ${antwort!.status} ${(await antwort!.text()).slice(0, 300)}`);
    const daten = (await antwort!.json()) as { choices?: { message?: { content?: string } }[] };
    try {
      return leseJson(daten.choices?.[0]?.message?.content ?? "");
    } catch (fehler) {
      if (!(fehler instanceof UngueltigesJson) || !nochmal) throw fehler;
      console.warn(`Sprachmodell ${modell}: unbrauchbares JSON, frage ein zweites Mal.`);
      return this.#frage(nachrichten, maxTokens, modell, zeitlimitMs, false);
    }
  }

  /**
   * Lokales Modell über Ollama (native Schnittstelle /api/chat). Nur hier lassen sich Kontextlänge (num_ctx)
   * und JSON-Modus zuverlässig setzen; die OpenAI-kompatible Schnittstelle von Ollama ignoriert num_ctx.
   */
  async #frageOllama(nachrichten: Nachricht[], maxTokens: number, modell: string, zeitlimitMs: number): Promise<unknown> {
    const antwort = await fetch(config.llm.basisUrl + config.llm.pfad, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modell, messages: nachrichten, stream: false, format: "json", keep_alive: "30m", options: { temperature: 0.2, num_ctx: kontextFuer(nachrichten, maxTokens), num_predict: maxTokens } }),
      signal: AbortSignal.timeout(zeitlimitMs),
    });
    if (!antwort.ok) throw new Error(`Lokales Sprachmodell (Ollama): HTTP ${antwort.status} ${(await antwort.text()).slice(0, 300)}`);
    const daten = (await antwort.json()) as { message?: { content?: string } };
    return leseJson(daten.message?.content ?? "");
  }

  async chronist(stand: Protokoll, abschnitt: string): Promise<unknown> {
    const punkt = stand.agenda.find((a) => a.status === "läuft")?.id ?? "";
    // Der vorherige Abschnitt geht als Kontext mit, damit Zusagen an der Schnittkante nicht verloren gehen.
    const davor = store.daten.transkript.at(-2)?.text ?? "";
    const technik = `${TECHNIK_PROTOKOLL}\n\n${FORMAT_STAND}\n\n${sprachbefehle()}`;
    const daten = `STAND:\n${JSON.stringify(arbeitsstand(stand, punkt))}\n\nAKTUELLER AGENDAPUNKT: ${stand.agenda.find((a) => a.status === "läuft")?.titel ?? "(keiner ausgewählt)"}\n\nVORHERIGER ABSCHNITT (nur zum Verständnis, bereits verarbeitet):\n${davor || "(keiner)"}\n\nABSCHNITT:\n${abschnitt}`;
    return this.#frage(
      config.llm.modellProtokoll
        ? // Eigenes Modell (z. B. Broki "broki-protokoll"): Rolle und Regeln kommen aus dessen System-Prompt.
          // Keine eigene System-Nachricht schicken – Open WebUI wendet den Modell-Prompt sonst nicht zuverlässig an.
          // Der technische Teil (Format, Sprachbefehle) steht deshalb vor den Daten in der Nutzer-Nachricht.
          [{ role: "user", content: `TECHNISCHE VORGABEN DER APP:\n${technik}\n\n${daten}` }]
        : [
            { role: "system", content: `${einstellungen.promptAssistent}\n\n${technik}` },
            { role: "user", content: daten },
          ],
      8000,
      config.llm.modellProtokoll || config.llm.modell,
    );
  }

  async expertenrunde({ frage, an, verlauf }: ChatKontext): Promise<{ von: string; text: string }[]> {
    const gefragt = agentenFuer(store.daten.agenten).filter((a) => an === "alle" || a.id === an);
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

  async verdichte(material: { titel: string; art: string; text: string }[], kontext: { name: string; agenda: string[] }): Promise<{ wissen: string; begriffe: string }> {
    // Sehr viel Material wird gleichmäßig gekürzt, damit die Anfrage in das Kontextfenster passt.
    const budget = 150_000;
    const jeStueck = Math.max(2000, Math.floor(budget / Math.max(1, material.length)));
    const quellen = material.map((m, i) => `### Quelle ${i + 1}: ${m.art} – ${m.titel}\n${m.text.slice(0, jeStueck)}${m.text.length > jeStueck ? "\n[… gekürzt]" : ""}`).join("\n\n");
    const antwort = await this.#frage(
      [
        {
          role: "system",
          content: `Du bereitest einen Workshop vor. Aus eingereichtem Material (Interviews, Dokumente) erstellst du das Vorwissen für KI-Agenten, die im Workshop Fragen beantworten.

Antworte ausschließlich als JSON: {"wissen": "…Markdown…", "begriffe": "Begriff 1, Begriff 2, …"}

Regeln für "wissen":
- Gliedere nach Themen mit Überschriften (##), nicht nach Quellen. Orientiere dich an der Agenda.
- Halte fest: Abläufe, Schmerzpunkte, Zahlen, Systeme, Beispiele, Wünsche, Widersprüche zwischen den Quellen.
- Nenne NICHT, welche Person etwas gesagt hat. Schreibe z. B. "mehrfach genannt" oder "eine Einzelmeinung", aber keine Namen als Quelle.
- Erfinde nichts. Was unklar oder widersprüchlich ist, kommt in einen Abschnitt "Offen / zu klären".
- Deutsch, knapp, Stichpunkte. Höchstens etwa 1200 Wörter.

"begriffe": Fachbegriffe, Produkt-, System- und Eigennamen aus dem Material, die eine Spracherkennung richtig schreiben soll. Mit Komma getrennt, höchstens 40.`,
        },
        { role: "user", content: `WORKSHOP: ${kontext.name}\nAGENDA:\n${kontext.agenda.map((a, i) => `${i + 1}. ${a}`).join("\n") || "(keine)"}\n\nMATERIAL:\n\n${quellen}` },
      ],
      6000,
    );
    const geprueft = z.object({ wissen: z.string().min(1), begriffe: z.string().catch("") }).parse(antwort);
    return geprueft;
  }

  async fasseZusammen(prompt: string, inhalt: string): Promise<string> {
    const antwort = await this.#frage(
      [
        { role: "system", content: `${prompt}\n\nFormat: Markdown. Abschnitte als "## Überschrift", Stichpunkte mit "- ", Unterpunkte mit zwei Leerzeichen eingerückt. Antworte ausschließlich als JSON: {"markdown": "…"}` },
        { role: "user", content: inhalt },
      ],
      4000,
      config.llm.modell,
      120_000, // ein ganzer Tag Transkript braucht etwas
    );
    return z.object({ markdown: z.string().min(1) }).parse(antwort).markdown.trim();
  }

  async merlinBefehl(text: string, kontext: string): Promise<unknown> {
    return this.#frage(
      [
        {
          role: "system",
          content: `Du bist "Merlin", der Navigator einer Meeting-App. Ordne den Satz des Nutzers GENAU EINER Aktion zu. Antworte nur als JSON.

Erlaubte Aktionen:
{"aktion": "gehe", "ziel": "start|meeting|workshop|assistent|agenten|archiv|admin|regie"}
{"aktion": "meeting-neu", "name": "…" (optional)}
{"aktion": "workshop-neu"}
{"aktion": "meeting-oeffnen", "name": "Name des Meetings"}
{"aktion": "workshop-oeffnen", "name": "Name des Workshops"}
{"aktion": "aufnahme-start"}
{"aktion": "aufnahme-pause"}
{"aktion": "meeting-schliessen"}
{"aktion": "ansage", "station": "begruessung|eingereicht|regeln|agenda"}
{"aktion": "frage", "an": "alle oder Name des Agenten", "text": "die Frage"}
{"aktion": "einstellung", "ziel": "lesetempo|stimme|pause|prompts|takt|wort|schutz|sprachfragen|agenten|meetings|workshops"}
{"aktion": "liste", "art": "meetings|workshops|alle"}  (letzte/alle Meetings oder Workshops zeigen)
{"aktion": "zurueck"}  (zurück ins gerade geöffnete Meeting bzw. den Workshop)
{"aktion": "material", "text": "der Satz"}  (hinterlegte Dokumente/Material eines Workshops finden)
{"aktion": "hilfe"}
{"aktion": "unbekannt"}

Regeln: Löschen gibt es nicht (dann "unbekannt"). Im Zweifel "unbekannt". Will jemand zu einem bestimmten Meeting oder Workshop, nimm "meeting-oeffnen" bzw. "workshop-oeffnen" und übernimm den Namen GENAU aus der Liste im KONTEXT (auch bei Hörfehlern den ähnlichsten). "assistent" und "agenten" nur, wenn bereits ein Meeting geöffnet ist. "eingereicht" = eingereichtes Material zusammenfassen. "assistent" = Meeting Assistent mit Protokoll und To-dos.`,
        },
        { role: "user", content: `KONTEXT:\n${kontext}\n\nSATZ: ${text.slice(0, 500)}` },
      ],
      120,
      config.llm.modellMerlin, // klein und schnell: es geht nur um die Zuordnung zu einer Aktion
      6_000, // länger soll niemand auf Merlin warten; danach fragt er nach
    );
  }

  async sprechtext(wissen: string, name: string): Promise<string> {
    const antwort = await this.#frage(
      [
        {
          role: "system",
          content: `Du schreibst einen kurzen Text, der zu Beginn eines Workshops laut vorgelesen wird. Er fasst zusammen, was die Teilnehmenden zur Vorbereitung eingereicht haben.

Antworte ausschließlich als JSON: {"text": "…"}

Regeln: 4 bis 6 kurze Sätze in gesprochener Sprache, Du-Form in der Mehrzahl ("ihr"). Nenne die zwei bis vier wichtigsten Themen und, falls vorhanden, einen Punkt, bei dem die Einschätzungen auseinandergehen. Keine Namen, keine Aufzählungszeichen, keine Abkürzungen, keine Zahlenkolonnen. Erfinde nichts. Beginne mit "Zur Vorbereitung habt ihr …".`,
        },
        { role: "user", content: `WORKSHOP: ${name}\n\nVORWISSEN:\n${wissen.slice(0, 40_000)}` },
      ],
      600,
    );
    return z.object({ text: z.string().min(1) }).parse(antwort).text.trim();
  }
}
