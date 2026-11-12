import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { config } from "./config.ts";
import { ROLLEN, type Adressat, type Protokoll, type Rolle } from "./types.ts";

// Alles, was sich in der Admin-Ansicht einstellen lässt. Gespeichert in data/einstellungen.json.
const AgentSchema = z.object({
  name: z.string().trim().min(1).max(40),
  beschreibung: z.string().trim().max(2000),
  /** Wissensdatei des Agenten (Markdown/Text). Wird bei jeder Frage an diesen Agenten mitgeschickt. */
  wissen: z.string().max(300_000).default(""),
});
export const EinstellungenSchema = z.object({
  briefing: z.string().max(50_000),
  /** Fachbegriffe und Namen, die die Transkription richtig schreiben soll (Komma oder Zeilenumbruch) */
  begriffe: z.string().max(4000),
  promptAssistent: z.string().trim().min(1).max(20_000),
  promptAgenten: z.string().trim().min(1).max(20_000),
  promptZusammenfassung: z.string().trim().min(1).max(20_000),
  agenten: z.object({ sales: AgentSchema, bpm: AgentSchema, consultant: AgentSchema }),
  maxTodosProZyklus: z.number().int().min(1).max(10),
});
export type Einstellungen = z.infer<typeof EinstellungenSchema>;

const datei = path.join(path.dirname(config.pfade.daten), "einstellungen.json");

/** Standardwerte für Prompts und Rollen. Die Agenda gehört zum jeweiligen Tag (store.ts). */
export function standard(): Einstellungen {
  return {
    briefing: "",
    begriffe: "Brodos, Broki, Darling, Dynamics, DaaS+",
    promptAssistent: `Du bist "Darling", der Transkriptions-Assistent im Brodos Sales Agentic Workshop. Du hörst über
Transkript-Abschnitte mit und führst das Protokoll.

Du bekommst:
1. STAND: das aktuelle Protokoll als JSON
2. ABSCHNITT: die letzten ca. 60 Sekunden Gespräch (Transkript, ohne Sprecher)

Gib den aktualisierten STAND zurück. Nur JSON, kein Text davor oder danach.

Regeln:
- NEUES TO-DO nur, wenn eine konkrete Aufgabe zugesagt oder vergeben wird.
  Ideen und Vorschläge sind keine To-dos.
- VORSCHLAG, wenn du unsicher bist, ob etwas ein To-do ist (z. B. "da müsste
  mal jemand draufschauen", "das sollten wir uns ansehen"). Trage es dann unter
  "vorschlaege" ein, nicht unter "todos". Ein Mensch entscheidet darüber.
- OWNER und FRIST nur, wenn ausdrücklich genannt. Sonst "offen". Nie raten.
- ERLEDIGT nur, wenn klar gesagt wird, dass etwas abgeschlossen ist.
- Die Agenda steuert die Moderation. Ändere den Status von Agendapunkten nicht.
- ENTSCHEIDUNG nur bei klarer Festlegung ("Wir machen …", "Beschlossen").
- OFFENE FRAGE, wenn eine Frage gestellt und nicht beantwortet wird.
- Kein Duplikat. Bestehende Einträge nie löschen oder umformulieren, nur Status ändern.
- Direkte Befehle ("Darling, notiere …", "Darling, To-do für …",
  "Darling, hake … ab") haben Vorrang.
- Unklarer Abschnitt: STAND unverändert zurückgeben.
- Deutsch, sachlich, höchstens 15 Wörter pro Eintrag.`,
    promptAgenten: `Du bist die Runde der Spezial-Agenten im Brodos Sales Agentic Workshop. Im Raum sitzen
Führungskräfte aus Vertrieb und IT. Ziel des Tages: den Brodos-Vertriebsprozess
aufnehmen, analysieren und mit KI neu strukturieren.

Kontext zu Brodos: [BRODOS-BRIEFING]
Agenda: [AGENDA]
Aktueller Protokollstand: [STAND]

Du vereinst drei Perspektiven:
[AGENTEN]

Antworte, wenn nicht anders verlangt, kurz aus allen drei Perspektiven
(je 1–3 Sätze, mit Rollenname als Label). Wird eine Rolle direkt angesprochen,
antworte nur aus dieser Rolle (max. 6 Sätze).

Immer: Deutsch, Du-Form, konkret auf das Gesagte bezogen, keine Floskeln,
keine erfundenen Zahlen oder Studien. Fehlen dir Infos über Brodos, sag das
und stelle eine Rückfrage. Wiederhole nicht, was bereits im Protokoll steht.`,
    promptZusammenfassung: `Du schreibst die Zusammenfassung eines Workshops. Grundlage sind das PROTOKOLL
(live geführt, verlässlich) und das TRANSKRIPT (automatisch erstellt, ohne Sprecher,
kann Hör- und Schreibfehler enthalten).

Aufbau:
- 3 bis 6 thematische Abschnitte mit kurzer, aussagekräftiger Überschrift
  (z. B. "Kontext und Hintergrund", "Problem: …", "Datenlage und Lösungsansatz").
  Gliedere nach Themen, nicht nach zeitlichem Ablauf.
- Pro Abschnitt 2 bis 5 Stichpunkte. Jeder Stichpunkt ist eine Kernaussage in
  einem Satz. Details, Beispiele und Zahlen kommen als eingerückte Unterpunkte.
- Nenne konkrete Zahlen, Systeme und Beispiele aus dem Gespräch, statt allgemein
  zu bleiben. Formuliere Ziele und Abgrenzungen klar ("nicht X, sondern Y").
- Letzter Abschnitt "Entscheidungen" (falls vorhanden), danach "Nächste Schritte":
  je Schritt eine Zeile "Aufgabe (Owner, Frist)" und darunter ein Satz, was genau
  zu tun ist. Übernimm dafür die To-dos aus dem PROTOKOLL vollständig. Owner und
  Frist nur, wenn sie genannt wurden, sonst "offen".

Regeln:
- Lass Begrüßung, Smalltalk, Technikprobleme und Wiederholungen weg.
- Erfinde nichts. Was unklar oder widersprüchlich ist, kommt in einen eigenen
  Abschnitt "Offen / zu klären".
- Korrigiere offensichtliche Transkriptionsfehler bei Namen und Fachbegriffen
  stillschweigend, wenn der Zusammenhang eindeutig ist.
- Deutsch, sachlich, knapp. Keine Einleitung, kein Fazit, keine Floskeln.`,
    agenten: {
      sales: {
        name: "Sales Professional",
        beschreibung: "20 Jahre B2B-Vertrieb, Handel, Distribution. Denkt vom Kunden und vom Abschluss her, pragmatisch, skeptisch gegenüber Papierprozessen.",
        wissen: "",
      },
      bpm: {
        name: "BPM Specialist",
        beschreibung: "Prozessmanagement und Automatisierung. Achtet auf Übergaben, Medienbrüche, fehlende Verantwortliche, Wartezeiten. Unterscheidet klar: feste Regel (klassische Automatisierung) vs. Urteilsvermögen (KI-Agent).",
        wissen: "",
      },
      consultant: {
        name: "Business Consultant",
        beschreibung: "Strategie und Umsetzung. Nutzen, Aufwand, Risiko, Reihenfolge, Change Management, erster Pilot mit Wirkung in 4–6 Wochen.",
        wissen: "",
      },
    },
    maxTodosProZyklus: 3,
  };
}

function laden(): Einstellungen {
  try {
    return EinstellungenSchema.parse({ ...standard(), ...JSON.parse(fs.readFileSync(datei, "utf8")) });
  } catch {
    return standard();
  }
}

export let einstellungen: Einstellungen = laden();

export function speichere(neu: Einstellungen): void {
  einstellungen = neu;
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, JSON.stringify(neu, null, 2));
}

/**
 * Setzt die Platzhalter im Prompt der Spezial-Agenten ein. Diesen Text bekommt später das Sprachmodell.
 * Wissensdateien werden nur für die gefragten Agenten angehängt – das hält den Prompt klein und die Antwort schnell.
 */
export function promptAgentenFertig(protokoll: Protokoll, an: Adressat = "alle"): string {
  const e = einstellungen;
  const mitWissen = (r: Rolle) => (an === "alle" || an === r) && e.agenten[r].wissen.trim();
  const agent = (r: Rolle) =>
    `- ${e.agenten[r].name}: ${e.agenten[r].beschreibung}` +
    (mitWissen(r) ? `\n\n<wissen agent="${e.agenten[r].name}">\n${e.agenten[r].wissen.trim()}\n</wissen>\n` : "");
  const ersetzungen: Record<string, string> = {
    "[BRODOS-BRIEFING]": e.briefing.trim() || "(kein Briefing hinterlegt)",
    "[AGENDA]": protokoll.agenda.map((a, i) => `${i + 1}. ${a.titel}${a.status === "läuft" ? " (läuft gerade)" : ""}`).join("\n"),
    "[STAND]": JSON.stringify(protokoll),
    "[AGENTEN]": ROLLEN.map(agent).join("\n"),
  };
  return Object.entries(ersetzungen).reduce((text, [platzhalter, wert]) => text.replaceAll(platzhalter, wert), e.promptAgenten);
}

const woerter = (t: string) => new Set(t.toLowerCase().replace(/[^\p{L}\p{N}+ ]/gu, " ").split(/\s+/).filter((w) => w.length > 2));
/** Anteil gemeinsamer Wörter (0–1). Erkennt denselben Eintrag auch bei leicht anderer Formulierung. */
function aehnlichkeit(a: string, b: string): number {
  const x = woerter(a);
  const y = woerter(b);
  if (!x.size || !y.size) return a.trim().toLowerCase() === b.trim().toLowerCase() ? 1 : 0;
  let gemeinsam = 0;
  for (const w of x) if (y.has(w)) gemeinsam++;
  return gemeinsam / Math.min(x.size, y.size);
}

/**
 * Sicherheitsnetz nach jeder Antwort des Assistenten (gilt unabhängig vom Prompt):
 * - Bestehende Einträge bleiben erhalten und behalten ihren Text, nur der Status darf sich ändern.
 * - Ein Eintrag gilt als "bestehend", wenn ID und Inhalt zu einem vorhandenen passen. Vergibt das
 *   Sprachmodell eine schon benutzte ID für etwas Neues, geht der Eintrag nicht mehr verloren.
 * - Neue Einträge bekommen ihre ID vom Server und den von Hand ausgewählten Agendapunkt.
 * - Neue To-dos sind pro Zyklus gedeckelt; was darüber liegt, wird zum Vorschlag.
 */
export function absichern(alt: Protokoll, neu: Protokoll, punkt = ""): Protokoll {
  const gleich = (a: string, b: string) => aehnlichkeit(a, b) >= 0.8;
  const naechste = (liste: { id: string }[], praefix: string) => Math.max(0, ...liste.map((e) => Number(e.id.slice(1)) || 0)) + 1;

  /** Trennt die Antwort in Status-Updates für bestehende Einträge und wirklich neue Einträge. */
  function teile<T extends { id: string; text: string }>(a: T[], n: T[]) {
    const updates = new Map<string, T>();
    const neue: T[] = [];
    for (const y of n) {
      const perId = a.find((x) => x.id === y.id && y.id !== "");
      if (perId && aehnlichkeit(perId.text, y.text) >= 0.5) updates.set(perId.id, y);
      else {
        const perText = a.find((x) => gleich(x.text, y.text));
        if (perText) updates.set(perText.id, y);
        else if (!neue.some((z) => gleich(z.text, y.text))) neue.push(y);
      }
    }
    return { updates, neue };
  }

  const t = teile(alt.todos, neu.todos);
  const v = teile(alt.vorschlaege, neu.vorschlaege);
  const e = teile(alt.entscheidungen, neu.entscheidungen);
  const f = teile(alt.offene_fragen, neu.offene_fragen);

  const max = einstellungen.maxTodosProZyklus;
  let tNr = naechste(alt.todos, "T");
  const todos = [
    ...alt.todos.map((x) => ({ ...x, status: t.updates.get(x.id)?.status ?? x.status })),
    ...t.neue.slice(0, max).map((y) => ({ ...y, id: `T${tNr++}`, gruppe: "", agendapunkt: punkt })),
  ];

  // Vorschläge: neue vom Sprachmodell plus To-dos über der Obergrenze – sofern nicht schon als To-do vorhanden
  const kandidaten = [...v.neue, ...t.neue.slice(max).map(({ status: _s, gruppe: _g, ...rest }) => rest)];
  const vorschlaege = [...alt.vorschlaege];
  for (const k of kandidaten) {
    if (![...vorschlaege, ...todos].some((x) => gleich(x.text, k.text))) vorschlaege.push({ ...k, agendapunkt: punkt, id: `V-${randomUUID().slice(0, 8)}` });
  }

  let eNr = naechste(alt.entscheidungen, "E");
  let fNr = naechste(alt.offene_fragen, "F");
  return {
    agenda: alt.agenda, // die Agenda steuert die Moderation von Hand, nicht das Sprachmodell
    todos,
    vorschlaege,
    entscheidungen: [...alt.entscheidungen, ...e.neue.map((y) => ({ ...y, id: `E${eNr++}`, agendapunkt: punkt }))],
    offene_fragen: [
      ...alt.offene_fragen.map((x) => ({ ...x, status: f.updates.get(x.id)?.status ?? x.status })),
      ...f.neue.map((y) => ({ ...y, id: `F${fNr++}` })),
    ],
    notizen: [...alt.notizen, ...neu.notizen.filter((n) => !alt.notizen.some((x) => gleich(x.text, n.text))).map((n) => ({ ...n, agendapunkt: punkt }))],
  };
}
