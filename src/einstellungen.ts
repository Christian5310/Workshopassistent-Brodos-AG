import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { config } from "./config.ts";
import type { Adressat, Protokoll } from "./types.ts";

// Globale Einstellungen: Spezial-Agenten, Prompts, Obergrenze. Gespeichert in data/einstellungen.json.
// Hintergrundwissen, Fachbegriffe und Agenda gehören zum jeweiligen Meeting (store.ts).
export const FIGUREN = ["sales", "bpm", "consultant", "kuerzel"] as const;
/** Nur Farben aus der Brodos-Palette (Designvorlage Abschnitt 4). */
export const FARBEN = ["#0069b4", "#004080", "#31435e"] as const;

/** Was sich an einem Spezial-Agenten einstellen lässt (ohne ID). */
export const AgentEingabeSchema = z.object({
  name: z.string().trim().min(1).max(40),
  /** Rollen-Prompt: Wer ist der Agent, worauf achtet er, wie antwortet er? */
  beschreibung: z.string().trim().max(8000),
  /** Wissensdatei (Markdown/Text). Wird bei jeder Frage an diesen Agenten mitgeschickt. */
  wissen: z.string().max(300_000).default(""),
  /** Symbol des Agenten (Linien-Icon); die Werte heißen aus historischen Gründen wie die ersten drei Agenten */
  figur: z.enum(FIGUREN).default("kuerzel"),
  farbe: z.enum(FARBEN).catch("#0069b4"), // früher erlaubte Farben außerhalb der Palette fallen auf die Primärfarbe zurück
});
const AgentSchema = AgentEingabeSchema.extend({ id: z.string().regex(/^[a-z0-9-]{1,40}$/) });
export type Agent = z.infer<typeof AgentSchema>;

/** Prompts und Obergrenze – der Teil, den die Admin-Ansicht unter "Erweitert" speichert. */
export const ErweitertSchema = z.object({
  promptAssistent: z.string().trim().min(1).max(20_000),
  promptAgenten: z.string().trim().min(1).max(20_000),
  promptZusammenfassung: z.string().trim().min(1).max(20_000),
  maxTodosProZyklus: z.number().int().min(1).max(10),
  /** Wie oft ein Audio-Abschnitt gesendet wird (Sekunden). Kürzer = To-dos erscheinen schneller. */
  zyklusSekunden: z.number().int().min(15).max(120).default(30),
  /** Name, auf den der Assistent im Raum hört ("Merlin, To-do für …") */
  aktivierungswort: z.string().trim().min(2).max(30).default("Merlin"),
  /** Dürfen die Spezial-Agenten per Sprache gefragt werden ("Merlin, Frage an …")? */
  sprachfragen: z.boolean().default(true),
});
export const EinstellungenSchema = ErweitertSchema.extend({ agenten: z.array(AgentSchema).min(1).max(12) });
export type Einstellungen = z.infer<typeof EinstellungenSchema>;

const datei = path.join(path.dirname(config.pfade.daten), "einstellungen.json");

/** Standardwerte für Prompts und Rollen. Die Agenda gehört zum jeweiligen Tag (store.ts). */
export function standard(): Einstellungen {
  return {
    promptAssistent: `Du bist "Merlin", der Transkriptions-Assistent im Brodos Sales Agentic Workshop. Du hörst über
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
- Direkte Befehle ("Merlin, notiere …", "Merlin, To-do für …",
  "Merlin, hake … ab") haben Vorrang.
- Unklarer Abschnitt: STAND unverändert zurückgeben.
- Deutsch, sachlich, höchstens 15 Wörter pro Eintrag.`,
    promptAgenten: `Du bist die Runde der Spezial-Agenten im Brodos Sales Agentic Workshop. Im Raum sitzen
Führungskräfte aus Vertrieb und IT. Ziel des Tages: den Brodos-Vertriebsprozess
aufnehmen, analysieren und mit KI neu strukturieren.

Kontext zu Brodos: [BRODOS-BRIEFING]
Agenda: [AGENDA]
Aktueller Protokollstand: [STAND]

Du vereinst diese Perspektiven:
[AGENTEN]

Antworte, wenn nicht anders verlangt, kurz aus allen Perspektiven
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
    agenten: [
      {
        id: "sales",
        name: "Sales Professional",
        beschreibung: "20 Jahre B2B-Vertrieb, Handel, Distribution. Denkt vom Kunden und vom Abschluss her, pragmatisch, skeptisch gegenüber Papierprozessen.",
        wissen: "",
        figur: "sales",
        farbe: "#0069b4",
      },
      {
        id: "bpm",
        name: "BPM Specialist",
        beschreibung: "Prozessmanagement und Automatisierung. Achtet auf Übergaben, Medienbrüche, fehlende Verantwortliche, Wartezeiten. Unterscheidet klar: feste Regel (klassische Automatisierung) vs. Urteilsvermögen (KI-Agent).",
        wissen: "",
        figur: "bpm",
        farbe: "#004080",
      },
      {
        id: "consultant",
        name: "Business Consultant",
        beschreibung: "Strategie und Umsetzung. Nutzen, Aufwand, Risiko, Reihenfolge, Change Management, erster Pilot mit Wirkung in 4–6 Wochen.",
        wissen: "",
        figur: "consultant",
        farbe: "#31435e",
      },
    ],
    maxTodosProZyklus: 3,
    zyklusSekunden: 30,
    aktivierungswort: "Merlin",
    sprachfragen: true,
  };
}

function laden(): Einstellungen {
  try {
    const roh = JSON.parse(fs.readFileSync(datei, "utf8"));
    // Ältere Versionen hatten genau drei feste Agenten als Objekt { sales, bpm, consultant }
    if (roh.agenten && !Array.isArray(roh.agenten)) {
      const vorlage = standard().agenten;
      roh.agenten = Object.entries(roh.agenten as Record<string, object>).map(([id, a]) => ({ ...vorlage.find((v) => v.id === id), ...a, id }));
    }
    // Früher hieß das Aktivierungswort "Darling": gespeicherte Prompts umstellen
    if (typeof roh.promptAssistent === "string" && !roh.aktivierungswort) roh.promptAssistent = roh.promptAssistent.replaceAll("Darling", "Merlin");
    return EinstellungenSchema.parse({ ...standard(), ...roh });
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

export const agent = (id: string) => einstellungen.agenten.find((a) => a.id === id);

/** Die Agenten, die an einem Meeting teilnehmen (ohne Auswahl: alle). */
export const agentenFuer = (ids?: string[]) => (ids ? einstellungen.agenten.filter((a) => ids.includes(a.id)) : einstellungen.agenten);

/** Legt einen Agenten an; die ID entsteht aus dem Namen und bleibt danach fest. */
export function agentAnlegen(eingabe: z.infer<typeof AgentEingabeSchema>): Agent {
  const kurz = eingabe.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "agent";
  let id = kurz;
  for (let n = 2; agent(id) || id === "alle" || id === "frage"; n++) id = `${kurz}-${n}`;
  const neu = { ...eingabe, id };
  speichere({ ...einstellungen, agenten: [...einstellungen.agenten, neu] });
  return neu;
}

/**
 * Setzt die Platzhalter im Prompt der Spezial-Agenten ein. Diesen Text bekommt das Sprachmodell.
 * Wissensdateien werden nur für die gefragten Agenten angehängt – das hält den Prompt klein und die Antwort schnell.
 */
export function promptAgentenFertig(meeting: { protokoll: Protokoll; briefing: string; agenten?: string[] }, an: Adressat = "alle"): string {
  const e = einstellungen;
  const zeile = (a: Agent) =>
    `- ${a.name}: ${a.beschreibung}` + ((an === "alle" || an === a.id) && a.wissen.trim() ? `\n\n<wissen agent="${a.name}">\n${a.wissen.trim()}\n</wissen>\n` : "");
  const ersetzungen: Record<string, string> = {
    "[BRODOS-BRIEFING]": meeting.briefing.trim() || "(kein Hintergrundwissen hinterlegt)",
    "[AGENDA]": meeting.protokoll.agenda.map((a, i) => `${i + 1}. ${a.titel}${a.status === "läuft" ? " (läuft gerade)" : ""}`).join("\n"),
    "[STAND]": JSON.stringify(meeting.protokoll),
    "[AGENTEN]": agentenFuer(meeting.agenten).map(zeile).join("\n"),
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
