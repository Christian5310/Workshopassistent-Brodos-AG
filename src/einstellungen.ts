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
  agenda: z.array(z.string().trim().min(1).max(120)).max(30),
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

/** Standardwerte: Prompts und Rollen aus CLAUDE.md (Abschnitt 5 und 6), Agenda aus config/agenda.json. */
export function standard(): Einstellungen {
  const agenda = JSON.parse(fs.readFileSync(config.pfade.agenda, "utf8")) as { titel: string }[];
  return {
    agenda: agenda.map((a) => a.titel),
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
  Agendapunkt erledigt, wenn die Gruppe zum nächsten Punkt wechselt.
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
    "[AGENDA]": e.agenda.map((t, i) => `${i + 1}. ${t}`).join("\n"),
    "[STAND]": JSON.stringify(protokoll),
    "[AGENTEN]": ROLLEN.map(agent).join("\n"),
  };
  return Object.entries(ersetzungen).reduce((text, [platzhalter, wert]) => text.replaceAll(platzhalter, wert), e.promptAgenten);
}

/**
 * Überträgt die Agenda aus den Einstellungen ins laufende Protokoll.
 * Punkte mit gleichem Titel behalten ID und Status, neue bekommen eine freie ID.
 */
export function agendaAnwenden(protokoll: Protokoll): void {
  const alt = protokoll.agenda;
  let zaehler = Math.max(0, ...alt.map((a) => Number(a.id.slice(1)) || 0));
  protokoll.agenda = einstellungen.agenda.map((titel) => {
    const bekannt = alt.find((a) => a.titel === titel);
    return bekannt ?? { id: `A${++zaehler}`, titel, status: "offen" as const };
  });
}

/**
 * Sicherheitsnetz nach jeder Antwort des Assistenten (gilt unabhängig vom Prompt):
 * Bestehende Einträge bleiben erhalten und behalten ihren Text, nur der Status darf sich ändern.
 * Neue To-dos sind pro Zyklus gedeckelt, damit die Liste nicht geflutet wird; was darüber liegt, wird zum Vorschlag.
 */
export function absichern(alt: Protokoll, neu: Protokoll): Protokoll {
  const fuehreZusammen = <T extends { id: string }>(a: T[], n: T[], status: (x: T, y: T) => T, max = Infinity): T[] => [
    ...a.map((x) => {
      const y = n.find((k) => k.id === x.id);
      return y ? status(x, y) : x;
    }),
    ...n.filter((y) => !a.some((x) => x.id === y.id)).slice(0, max),
  ];
  const gleich = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const neueTodos = neu.todos.filter((y) => !alt.todos.some((x) => x.id === y.id));
  // Vorschläge: bestehende bleiben, neue kommen dazu – ebenso To-dos, die über der Obergrenze liegen.
  const kandidaten = [
    ...neu.vorschlaege.filter((y) => !alt.vorschlaege.some((x) => x.id === y.id)),
    ...neueTodos.slice(einstellungen.maxTodosProZyklus).map(({ status: _status, ...rest }) => rest),
  ];
  const vorschlaege = [...alt.vorschlaege];
  for (const k of kandidaten) {
    const doppelt = [...vorschlaege, ...alt.todos, ...neueTodos.slice(0, einstellungen.maxTodosProZyklus)].some((x) => gleich(x.text, k.text));
    if (!doppelt) vorschlaege.push({ ...k, id: `V-${randomUUID().slice(0, 8)}` }); // IDs vergibt der Server
  }
  return {
    vorschlaege,
    agenda: alt.agenda.map((x) => ({ ...x, status: neu.agenda.find((y) => y.id === x.id)?.status ?? x.status })),
    todos: fuehreZusammen(alt.todos, neu.todos, (x, y) => ({ ...x, status: y.status }), einstellungen.maxTodosProZyklus),
    entscheidungen: fuehreZusammen(alt.entscheidungen, neu.entscheidungen, (x) => x),
    offene_fragen: fuehreZusammen(alt.offene_fragen, neu.offene_fragen, (x, y) => ({ ...x, status: y.status })),
    notizen: [...alt.notizen, ...neu.notizen.slice(alt.notizen.length)],
  };
}
