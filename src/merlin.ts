import { z } from "zod";
import { agentenFuer, einstellungen } from "./einstellungen.ts";
import { store } from "./store.ts";
import * as workshops from "./workshops.ts";

/**
 * Merlin als Navigator: übersetzt einen getippten oder gesprochenen Satz in genau eine Aktion der App.
 * Zuerst feste Regeln (schnell, ohne KI, auch im Mock). Nur wenn keine Regel greift, fragt der Server das Sprachmodell.
 * Ausgeführt wird die Aktion im Browser (App-Rahmen), damit sie dieselben Wege nimmt wie ein Klick.
 * Löschen ist per Merlin bewusst nicht möglich.
 */
export const ZIELE = ["start", "meeting", "workshop", "assistent", "agenten", "pinnwand", "archiv", "admin", "regie"] as const;
export const STATIONEN = ["begruessung", "eingereicht", "regeln", "agenda"] as const;

/** Wo welche Einstellung steht (Admin-Bereich und Feld), damit Merlin hinführen kann. */
export const EINSTELLUNGEN = {
  lesetempo: { bereich: "erweitert", feld: "lesetempo", name: "zur Lesegeschwindigkeit" },
  stimme: { bereich: "erweitert", feld: "stimme", name: "zu meiner Stimme" },
  pause: { bereich: "erweitert", feld: "pauseAn", name: "zur Pausen-Erinnerung" },
  prompts: { bereich: "erweitert", feld: "promptAssistent", name: "zu den Prompts" },
  takt: { bereich: "meetings", feld: "takt", name: "zum Takt der Transkription" },
  wort: { bereich: "meetings", feld: "wort", name: "zum Aktivierungswort" },
  schutz: { bereich: "meetings", feld: "maxTodos", name: "zum Schutz vor zu vielen To-dos" },
  sprachfragen: { bereich: "meetings", feld: "sprachfragen", name: "zu den Sprachfragen an die Agenten" },
  agenten: { bereich: "agenten", feld: "agent-liste", name: "zu den Spezial-Agenten" },
  meetings: { bereich: "meetings", feld: "meeting-liste", name: "zu den Meetings (Agenda, Hintergrundwissen, Fachbegriffe)" },
  workshops: { bereich: "workshops", feld: "workshop-liste", name: "zu den Workshops" },
} as const;
const BEREICH_NAME: Record<string, string> = { erweitert: "Admin → Erweitert", meetings: "Admin → Meetings", agenten: "Admin → Spezial-Agenten", workshops: "Admin → Workshops" };

export const BefehlSchema = z.discriminatedUnion("aktion", [
  z.object({ aktion: z.literal("gehe"), ziel: z.enum(ZIELE) }),
  z.object({ aktion: z.literal("meeting-neu"), name: z.string().max(80).optional() }),
  z.object({ aktion: z.literal("workshop-neu") }),
  z.object({ aktion: z.literal("meeting-oeffnen"), name: z.string().max(120) }),
  z.object({ aktion: z.literal("workshop-oeffnen"), name: z.string().max(120) }),
  z.object({ aktion: z.literal("aufnahme-start") }),
  z.object({ aktion: z.literal("aufnahme-pause") }),
  z.object({ aktion: z.literal("meeting-schliessen") }),
  z.object({ aktion: z.literal("ansage"), station: z.enum(STATIONEN) }),
  z.object({ aktion: z.literal("frage"), an: z.string().max(40), text: z.string().min(1).max(2000) }),
  z.object({ aktion: z.literal("einstellung"), ziel: z.enum(Object.keys(EINSTELLUNGEN) as [keyof typeof EINSTELLUNGEN, ...(keyof typeof EINSTELLUNGEN)[]]) }),
  z.object({ aktion: z.literal("liste"), art: z.enum(["meetings", "workshops", "alle"]) }),
  z.object({ aktion: z.literal("zurueck") }),
  z.object({ aktion: z.literal("material"), text: z.string().max(500) }),
  z.object({ aktion: z.literal("wissen"), frage: z.string().min(1).max(500) }),
  z.object({ aktion: z.literal("uhrzeit") }),
  z.object({ aktion: z.literal("agenten-rolle"), wer: z.enum(["sales", "bpm", "consultant", "alle"]) }),
  z.object({ aktion: z.literal("todo-neu"), text: z.string().max(300), owner: z.string().max(60).optional(), frist: z.string().max(60).optional() }),
  z.object({ aktion: z.literal("todo-verschieben"), todo: z.string().max(300), ziel: z.string().max(120) }),
  z.object({ aktion: z.literal("todo-erledigt"), todo: z.string().max(300) }),
  z.object({ aktion: z.literal("todo-aendern"), todo: z.string().max(300), text: z.string().max(300).optional(), owner: z.string().max(60).optional(), frist: z.string().max(60).optional() }),
  z.object({ aktion: z.literal("todo-loeschen"), todo: z.string().max(300) }),
  z.object({ aktion: z.literal("ja") }),
  z.object({ aktion: z.literal("nein") }),
  z.object({ aktion: z.literal("hilfe") }),
  z.object({ aktion: z.literal("fuehrung") }),
  z.object({ aktion: z.literal("tagesablauf") }),
  z.object({ aktion: z.literal("aufwaermen") }),
  z.object({ aktion: z.literal("aufwaermen-weiter") }),
  z.object({ aktion: z.literal("punkt-wechseln"), ziel: z.string().max(120) }), // "@weiter", "@zurueck" oder Nummer/Titel
  z.object({ aktion: z.literal("rueckgaengig") }),
  z.object({ aktion: z.literal("eintrag-neu"), art: z.enum(["entscheidung", "frage"]), text: z.string().max(300) }),
  z.object({ aktion: z.literal("timer"), sekunden: z.number().int().min(1).max(14400).optional() }),
  z.object({ aktion: z.literal("timer-stopp") }),
  z.object({ aktion: z.literal("frage-dazu"), an: z.string().max(40) }),
  z.object({ aktion: z.literal("loeschen") }),
  z.object({ aktion: z.literal("unbekannt") }),
]);
export type Befehl = z.infer<typeof BefehlSchema>;

/** Vorschläge, die Merlin als Knöpfe anbietet (z. B. die vorhandenen Meetings). */
export type Auswahl = { text: string; befehl?: string; link?: string; archiv?: string };

/** Die neuesten Meetings (auch abgeschlossene, die öffnen im Archiv). */
function auswahlLetzteMeetings(anzahl: number): Auswahl[] {
  return meetings()
    .sort((a, b) => b.datum.localeCompare(a.datum))
    .slice(0, anzahl)
    .map((t) => (t.abgeschlossen ? { text: `${t.name} (Archiv)`, archiv: t.id } : { text: t.name, befehl: `öffne das Meeting ${t.name}` }));
}

/** Material eines Workshops finden; Suche über Titel und "Von wem". */
function findeMaterial(text: string): { antwort: string; auswahl: Auswahl[]; einzeln?: { titel: string; link: string } } {
  const alle = workshops.liste();
  const offen = store.istOffen ? alle.find((w) => w.meetingId === store.daten.id) : undefined;
  const genannt = finde(alle, text, 0.5);
  const liste = genannt ? [genannt] : offen ? [offen] : alle;
  const nameWorte = new Set(liste.length === 1 ? inhaltsworte(liste[0]!.name) : []);
  const suche = inhaltsworte(text).filter((w) => !nameWorte.has(w) && !/^(zeig|zeige|finde|such|suche|dokument|dokumente|unterlagen|datei|dateien|material|materialien|einreichung|einreichungen|gibt|alle|ansehen|anzeigen|hol|hole|welche|liste|mir|uns|ist|sind|gib|bitte|alles)$/.test(w));
  const eintraege = liste.flatMap((w) => w.material.map((m) => ({ w, m })));
  const passend = suche.length ? eintraege.filter(({ m }) => suche.some((s) => inhaltsworte(`${m.titel} ${m.person}`).some((t) => aehnlich(s, t) >= 0.75))) : eintraege;
  const treffer = (passend.length ? passend : eintraege).slice(0, 8);
  const wo = liste.length === 1 ? `zum Workshop „${liste[0]!.name}“` : "in den Workshops";
  if (!treffer.length) return { antwort: `Ich habe kein Material ${wo} gefunden.`, auswahl: [] };
  if (suche.length && passend.length === 1) {
    const { w, m } = passend[0]!;
    return { antwort: `Ich öffne „${m.titel}“.`, auswahl: [], einzeln: { titel: m.titel, link: `/api/workshops/${w.id}/material/${m.id}?ansehen` } };
  }
  return {
    antwort: suche.length && !passend.length ? `Dazu habe ich nichts Passendes gefunden. Hier ist alles Material ${wo}:` : `Hier ist das Material ${wo}. Ein Klick öffnet es.`,
    auswahl: treffer.map(({ w, m }) => ({ text: liste.length > 1 ? `${m.titel} · ${w.name}` : m.titel, link: `/api/workshops/${w.id}/material/${m.id}?ansehen` })),
  };
}

/** Die neuesten offenen Meetings bzw. Workshops als Auswahl. */
function auswahlMeetings(): Auswahl[] {
  return meetings()
    .filter((t) => !t.abgeschlossen)
    .sort((a, b) => b.datum.localeCompare(a.datum))
    .slice(0, 5)
    .map((t) => ({ text: t.name, befehl: `öffne das Meeting ${t.name}` }));
}
function auswahlWorkshops(): Auswahl[] {
  return workshops.liste().slice(0, 5).map((w) => ({ text: w.name, befehl: `öffne den Workshop ${w.name}` }));
}

/** Was die App mit dem Befehl tun soll, inklusive aufgelöster IDs und Merlins Antwortsatz. */
export type Ergebnis =
  | { aktion: "gehe"; ziel: (typeof ZIELE)[number]; antwort: string; auswahl?: Auswahl[] }
  | { aktion: "meeting-neu"; name: string; antwort: string }
  | { aktion: "workshop-neu"; antwort: string }
  | { aktion: "meeting-oeffnen"; id: string; antwort: string }
  | { aktion: "workshop-oeffnen"; id: string; antwort: string }
  | { aktion: "aufnahme-start" | "aufnahme-pause" | "meeting-schliessen"; antwort: string }
  | { aktion: "ansage"; station: (typeof STATIONEN)[number]; antwort: string }
  | { aktion: "frage"; an: string; text: string; antwort: string }
  | { aktion: "einstellung"; bereich: string; feld: string; antwort: string }
  | { aktion: "agenda-fehlt"; workshop: boolean; antwort: string }
  | { aktion: "dokument"; titel: string; link: string; antwort: string }
  | { aktion: "wissen"; frage: string; antwort: string; quelle?: { titel: string; link: string } | null }
  | { aktion: "ja" | "nein"; antwort: string }
  | { aktion: "todo-neu"; text: string; owner: string; frist: string; agendapunkt: string; antwort: string }
  | { aktion: "todo-verschieben"; id: string; agendapunkt: string; antwort: string }
  | { aktion: "todo-erledigt"; id: string; antwort: string }
  | { aktion: "todo-aendern"; id: string; text?: string; owner?: string; frist?: string; antwort: string }
  | { aktion: "todo-loeschen"; id: string; antwort: string } // gelöscht wird erst nach "Ja" im Browser
  | { aktion: "gerufen" | "ignoriert"; antwort: string } // Freihand: nur der Name gesagt bzw. nichts für Merlin
  | { aktion: "nachfrage"; text: string; antwort: string } // Freihand: nicht sicher, ob Merlin gemeint war
  | { aktion: "fuehrung"; antwort: string }
  | { aktion: "tagesablauf"; antwort: string }
  | { aktion: "aufwaermen" | "aufwaermen-weiter"; antwort: string }
  | { aktion: "punkt-wechseln"; id: string; antwort: string } // wird auf dem Server ausgeführt
  | { aktion: "rueckgaengig"; antwort: string } // wird auf dem Server ausgeführt
  | { aktion: "eintrag-neu"; art: "entscheidung" | "frage"; text: string; agendapunkt: string; antwort: string } // wird auf dem Server ausgeführt
  | { aktion: "timer"; sekunden: number; antwort: string } // läuft im Browser
  | { aktion: "timer-stopp"; antwort: string }
  | { aktion: "todo-text-fehlt"; antwort: string } // "Füge ein To-do hinzu" ohne Text: Merlin fragt, der nächste Satz ist der Text
  | { aktion: "hilfe" | "unbekannt" | "hinweis"; antwort: string; auswahl?: Auswahl[] };

const klein = (s: string) =>
  s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9äöü+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Entfernt Anrede und Füllwörter am Anfang: "Merlin, bitte öffne …" → "öffne …" */
function bereinige(text: string): string {
  const wort = klein(einstellungen.aktivierungswort);
  let s = klein(text);
  for (const vorne of [wort, "hey", "hallo", "ok", "okay", "bitte", "kannst du", "könntest du", "würdest du", "mal"]) {
    if (s.startsWith(`${vorne} `) || s === vorne) s = s.slice(vorne.length).trim();
  }
  return s.replace(/ bitte$/, "").trim();
}

const FUELLWOERTER = new Set(["das", "den", "die", "der", "dem", "des", "ein", "eine", "einen", "meeting", "meetings", "workshop", "workshops", "besprechung", "von", "vom", "mit", "zum", "zur", "ins", "und", "für", "fuer", "bitte", "merlin", "öffne", "oeffne", "öffnen", "bring", "bringe", "mich", "führ", "führe", "geh", "gehe", "zeig", "zeige", "wechsel", "wechsle", "wechsele", "lade", "möchte", "will", "würde", "gerne", "gern", "bestehende", "bestehenden", "bestehendes", "zurück", "meinem", "unser", "unserem"]);
const inhaltsworte = (text: string) => klein(text).split(" ").filter((w) => w.length > 2 && !FUELLWOERTER.has(w));

/** Ähnlichkeit zweier Wörter (0..1), tolerant für Hörfehler der Spracherkennung ("Schur fix" ~ "Jour fixe"). */
function aehnlich(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length >= 4 && b.length >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.9;
  const d: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let vorher = d[0]!;
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, vorher + (a[i - 1] === b[j - 1] ? 0 : 1));
      vorher = temp;
    }
  }
  return 1 - d[b.length]! / Math.max(a.length, b.length);
}

/**
 * Bestes Meeting bzw. besten Workshop zu einem gesprochenen Satz finden.
 * Gezählt wird, wie viele Wörter des Namens im Satz (ungefähr) vorkommen.
 */
function finde<T extends { name: string }>(liste: T[], satz: string, schwelle = 0.6): T | null {
  const gesagt = inhaltsworte(satz);
  if (!gesagt.length) return null;
  let bestes: T | null = null;
  let punkte = 0;
  for (const eintrag of liste) {
    const name = inhaltsworte(eintrag.name);
    if (!name.length) continue;
    const treffer = name.map((n) => Math.max(...gesagt.map((g) => aehnlich(n, g)))).filter((wert) => wert >= 0.72).length / name.length;
    if (treffer > punkte) [bestes, punkte] = [eintrag, treffer];
  }
  return punkte >= schwelle ? bestes : null;
}

const meetings = () => store.liste().filter((t) => !workshops.liste().some((w) => w.meetingId === t.id));

/**
 * Zerlegt "Neues To-do für Anna: CRM-Export bis Freitag" in Text, Owner und Frist (ohne KI).
 * Live verfeinert das Sprachmodell das Ergebnis (siehe server.ts), das hier ist der schnelle Weg und der Rückfall.
 */
export function zerlegeTodo(satz: string): { text: string; owner?: string; frist?: string } {
  let rest = satz.trim().replace(/^(hey |ok |okay )?merlin[,.!:]?\s*/i, "").replace(/^bitte\s+/i, "");
  rest = rest.replace(/^.*?\b(?:to[ -]?dos?|tool|tu[ -]?dus?)\b\s*(anlegen|hinzufügen|notieren|aufnehmen|an|hinzu|auf)?\s*/i, "");
  let owner: string | undefined;
  let frist: string | undefined;
  const vorne = rest.match(/^(?:für|fuer|an)\s+([^:,]+?)\s*[:,]\s*(.*)$/i);
  if (vorne) [owner, rest] = [vorne[1]!.trim(), vorne[2]!];
  const bis = rest.match(/^(.*?)[,\s]+bis\s+((?:zum |zur |nächsten |naechsten |ende |anfang |mitte )?\S+(?:\s+\S+)?)[.!?]*$/i);
  if (bis) [rest, frist] = [bis[1]!, bis[2]!.trim()];
  if (!owner) {
    const fuer = rest.match(/^(.*?)\s+(?:für|fuer)\s+([A-ZÄÖÜ][\wäöüß-]*(?:\s+[A-ZÄÖÜ][\wäöüß-]*)?)\s*(.*)$/);
    if (fuer) {
      // "für Montag" ist eine Frist, kein Mensch
      const tag = /^(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|morgen|übermorgen|heute|nächste|naechste|kommende|ende|anfang|mitte)\b/i.test(fuer[2]!);
      rest = `${fuer[1]} ${fuer[3]}`;
      if (tag) frist ??= fuer[2]!.trim();
      else owner = fuer[2]!;
    }
  }
  const text = rest.replace(/^[\s:,–-]+|[\s.!?,]+$/g, "").replace(/\s+/g, " ");
  return { text, owner, frist };
}

/** Agendapunkt aus "Punkt 3", "dritten Punkt", "Preise" oder "ohne Agendapunkt" */
function findeAgendapunkt(ziel: string): { id: string; titel: string } | null {
  const agenda = store.daten.protokoll.agenda;
  const z = klein(ziel);
  if (/ohne (agenda ?punkt|punkt)|keinen? (agenda ?punkt|punkt)/.test(z)) return { id: "", titel: "Ohne Agendapunkt" };
  const ZAHLEN = ["eins", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn"];
  const ORDNUNG = ["ersten", "zweiten", "dritten", "vierten", "fünften", "sechsten", "siebten", "achten", "neunten", "zehnten"];
  const nr = z.match(/\b(\d{1,2})\b/)?.[1] ?? null;
  let index = nr ? Number(nr) - 1 : -1;
  if (index < 0) index = ZAHLEN.findIndex((w) => new RegExp(`\\b(punkt|top|nummer) ${w}\\b`).test(z));
  if (index < 0) index = ORDNUNG.findIndex((w) => z.includes(w));
  if (index >= 0 && agenda[index]) return { id: agenda[index]!.id, titel: agenda[index]!.titel };
  const treffer = finde(agenda.map((a) => ({ name: a.titel, id: a.id })), z.replace(/\b(agenda ?punkt|punkt|top|tagesordnungspunkt)\b/g, ""), 0.5);
  return treffer ? { id: treffer.id, titel: treffer.name } : null;
}

/** Workshop des gerade geöffneten Meetings (oder null) */
const offenerWorkshop = () => (store.istOffen ? (workshops.liste().find((w) => w.meetingId === store.daten.id) ?? null) : null);
/** Gibt es zum geöffneten Meeting etwas, aus dem Merlin Fragen beantworten kann? */
const hatWissen = () => store.istOffen && (!!store.daten.briefing?.trim() || !!offenerWorkshop()?.material.length);

/**
 * Quellen für eine Fachfrage: die verdichtete Zusammenfassung (Briefing) und die passendsten Dokumente
 * des geöffneten Workshops. Bewertet wird, wie oft Wörter der Frage in Titel (dreifach) und Text vorkommen.
 * Personennamen ("Von wem") gehen bewusst nicht mit.
 */
export function quellenFuerFrage(frage: string): { titel: string; text: string; link?: string }[] {
  if (!store.istOffen) return [];
  const w = offenerWorkshop();
  const worte = inhaltsworte(frage).filter((x) => !/^(wie|was|welche[nrs]?|sieht|aus|gibt|haben|wir|ihr|uns|ist|sind|steht|erklär|erklaer|beschreib|erzähl|erzaehl)$/.test(x));
  const bewertet = (w?.material ?? []).map((m) => {
    const titel = inhaltsworte(m.titel);
    const text = klein(m.text);
    const punkte = worte.reduce((summe, x) => summe + (titel.some((t) => aehnlich(x, t) >= 0.75) ? 3 : 0) + (text.includes(x) ? 1 : 0), 0);
    return { m, punkte };
  });
  const passend = bewertet.filter((b) => b.punkte > 0).sort((a, b) => b.punkte - a.punkte).slice(0, 3);
  const auswahl = passend.length ? passend : bewertet.slice(0, 3);
  const quellen: { titel: string; text: string; link?: string }[] = [];
  if (store.daten.briefing?.trim()) quellen.push({ titel: "Zusammenfassung des eingereichten Materials", text: store.daten.briefing });
  let platz = 120_000;
  for (const { m } of auswahl) {
    const text = m.text.slice(0, platz);
    if (!text) break;
    platz -= text.length;
    quellen.push({ titel: m.titel, text, link: w ? `/api/workshops/${w.id}/material/${m.id}?ansehen` : undefined });
  }
  return quellen;
}

/** Erkennt, ob jemand eine Einstellung sucht ("Ich möchte die Lesegeschwindigkeit ändern"). */
function findeEinstellung(s: string): keyof typeof EINSTELLUNGEN | null {
  const absicht = /(einstell|änder|aender|anpass|wo kann ich|wo finde|wo stell|konfigur|schneller|langsamer|bearbeit|verwalt|lösch|loesch|hinzufüg|anleg|neue[nr]? agent)/.test(s);
  if (/lesegeschwindigkeit|lesetempo|vorlesegeschwindigkeit|vorlesetempo|(schneller|langsamer) (vor)?(lesen|sprechen|reden)|(liest|sprichst|redest) (zu |viel zu )?(schnell|langsam)/.test(s)) return "lesetempo";
  if (/pausen ?erinnerung|an (eine |die )?pause erinnern/.test(s)) return "pause";
  if (/aktivierungswort|weckwort|wake ?word/.test(s)) return "wort";
  if (/\btakt\b|intervall|wie oft (wird )?(gesendet|transkribiert)/.test(s)) return "takt";
  if (/sprachfragen|per sprache fragen/.test(s)) return "sprachfragen";
  if (/obergrenze|zu viele to ?dos|schutz vor/.test(s)) return "schutz";
  if (!absicht) return null;
  if (/stimme/.test(s)) return "stimme";
  if (/prompt/.test(s)) return "prompts";
  if (/agent|fachwissen|wissensdatei/.test(s)) return "agenten";
  if (/workshops?\b/.test(s) && !/to ?do|entscheidung|frage/.test(s)) return "workshops";
  if (/(meetings?|besprechung)\b|hintergrundwissen|fachbegriffe/.test(s) && !/to ?do|entscheidung|frage/.test(s)) return "meetings";
  return null;
}

/** "Erklär uns die App", "Führung durch die App", "Rundgang", "Zeig uns die App" */
const FUEHRUNG = /(f(ü|ue)hrung|rundgang|app ?tour|\btour\b)|((erkl(ä|ae)r|zeig|stell)\w* (uns |mir |euch )?((doch|mal|kurz|bitte) )*(die |diese |unsere |eure |das )?(neue[nr]? )?(broki )?(meeting )?(app|anwendung|programm|tool|oberfl(ä|ae)che))|(wie funktioniert (die|das|unsere|diese) (neue )?(broki )?(meeting )?(app|anwendung|programm|tool))/;

/** "Lass uns ein Warm-up machen", "Aufwärmspiel", "Ideenspiel", "6-3-5" */
const AUFWAERMEN = /warm[ -]?up|aufw(ä|ae)rm|ideenspiel|ideen ?spiel|(?<![0-9])6[ -]?3[ -]?5(?![0-9])|sechs[ -]drei[ -]f(ü|ue)nf/;
/** Im Spiel: "Weiter" (nächste Runde) */
const SPIEL_WEITER = /^(?:ok(?:ay)? )?(?:und )?weiter(?: bitte| geht'?s| gehts)?$|^n(ä|ae)chste runde$/;

/** "Wie sieht der Tagesablauf aus?", "Worum geht es im heutigen Workshop?" */
const TAGESABLAUF = /tagesablauf|tagesplan|ablauf (des |von |für )?(heute|dem tag|den tag|tages)|(heutige[nrm]?|heutigen) (workshop|ablauf|tag)|(was|wie) (machen|haben|planen|steht) (wir|bei uns) heute|worum geht('s| es) (heute|im workshop|beim workshop)/;

const ZAHLWOERTER: Record<string, number> = { ein: 1, eine: 1, einen: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, zwoelf: 12, fünfzehn: 15, fuenfzehn: 15, zwanzig: 20, fünfundzwanzig: 25, fuenfundzwanzig: 25, dreißig: 30, dreissig: 30, vierzig: 40, fünfundvierzig: 45, fuenfundvierzig: 45, fünfzig: 50, fuenfzig: 50, sechzig: 60, neunzig: 90 };

/** "10 Minuten", "eine halbe Stunde", "Viertelstunde", "90 Sekunden" → Sekunden (oder null) */
export function dauerInSekunden(text: string): number | null {
  const s = text.toLowerCase().replace(/(\d),(\d)/g, "$1.$2");
  if (/dreiviertel ?stunde/.test(s)) return 45 * 60;
  if (/viertel ?stunde/.test(s)) return 15 * 60;
  if (/(eine )?halbe stunde|halbe std/.test(s)) return 30 * 60;
  if (/anderthalb stunden?|eineinhalb stunden?/.test(s)) return 90 * 60;
  const m = s.match(/(\d+(?:\.\d+)?|[a-zäöüß]+) ?(sekunden?|sek|minuten?|min|stunden?|std)\b/);
  if (!m) return null;
  const zahl = /^\d/.test(m[1]!) ? Number(m[1]) : ZAHLWOERTER[m[1]!];
  if (!zahl || !Number.isFinite(zahl)) return null;
  const faktor = /^sek/.test(m[2]!) ? 1 : /^m/.test(m[2]!) ? 60 : 3600;
  return Math.round(zahl * faktor);
}

/** Dauer für die Ansage: "10 Minuten", "1 Stunde 30 Minuten", "90 Sekunden" */
export function dauerText(sekunden: number): string {
  if (sekunden < 120) return `${sekunden} ${sekunden === 1 ? "Sekunde" : "Sekunden"}`;
  const h = Math.floor(sekunden / 3600);
  const min = Math.round((sekunden % 3600) / 60);
  return [h ? `${h} ${h === 1 ? "Stunde" : "Stunden"}` : "", min ? `${min} ${min === 1 ? "Minute" : "Minuten"}` : ""].filter(Boolean).join(" ");
}

/** Letzte Aussage aus dem Transkript, ohne die Sätze, in denen Merlin angesprochen wird */
export function letzteAussage(maxZeichen = 700): string {
  const wort = klein(einstellungen.aktivierungswort);
  const abschnitte = store.daten.transkript.slice(-2).map((t) => t.text).join(" ");
  const saetze = abschnitte.split(/(?<=[.!?])\s+/).filter((x) => !klein(x).includes(wort));
  return saetze.join(" ").slice(-maxZeichen).trim();
}

/** Feste Regeln. Reihenfolge zählt: spezielle Formulierungen vor allgemeinen. */
export function regeln(text: string): Befehl | null {
  const s = bereinige(text);
  if (!s) return null;
  let m: RegExpMatchArray | null;

  if (FUEHRUNG.test(s)) return { aktion: "fuehrung" };
  if (AUFWAERMEN.test(s)) return { aktion: "aufwaermen" };
  if (SPIEL_WEITER.test(s)) return { aktion: "aufwaermen-weiter" };
  if (TAGESABLAUF.test(s)) return { aktion: "tagesablauf" };
  // Timer: "Stell einen Timer auf 10 Minuten", "Timer 5 Minuten", "Timer abbrechen"
  if (/timer|stoppuhr|wecker/.test(s)) {
    if (/(abbrech|stopp|stop|lösch|loesch|aus\b|beend|vergiss)/.test(s) && dauerInSekunden(s) === null) return { aktion: "timer-stopp" };
    return { aktion: "timer", sekunden: dauerInSekunden(s) ?? undefined };
  }
  // Agendapunkt wechseln: "Weiter zum nächsten Punkt", "Starte Punkt 2", "Zurück zum vorherigen Punkt"
  if (/(n(ä|ae)chste[nrsm]?|weiter(er|en)?) (agenda ?)?(punkt|top|tagesordnungspunkt)|^weiter zum n(ä|ae)chsten/.test(s)) return { aktion: "punkt-wechseln", ziel: "@weiter" };
  if (/(vorherige[nrsm]?|letzte[nrsm]?|vorige[nrsm]?) (agenda ?)?(punkt|top)|zur(ü|ue)ck zum (vorherigen|letzten) punkt/.test(s) && /punkt|top/.test(s)) return { aktion: "punkt-wechseln", ziel: "@zurueck" };
  if ((m = s.match(/^(?:starte|beginne|gehe? zu(?:m|r)?|wechsel\w* zu(?:m|r)?|weiter zu(?:m|r)?|weiter mit|jetzt) (?:den |dem |der )?(?:agenda ?)?(?:punkt|top|tagesordnungspunkt) (.+)$/))) return { aktion: "punkt-wechseln", ziel: m[1]! };
  // Rückgängig: "Rückgängig", "Mach den letzten Schritt rückgängig", "Nimm das zurück"
  if (/r(ü|ue)ckg(ä|ae)ngig|nimm (das|es|den letzten schritt) zur(ü|ue)ck/.test(s)) return { aktion: "rueckgaengig" };
  // Entscheidung oder offene Frage notieren
  if ((m = s.match(/^(?:notiere|halte fest|schreib\w*|trag\w*|nimm auf|erfasse|erstelle|f(?:ü|ue)ge?)\s+(?:bitte )?(?:eine?n? )?(?:neue[nrs]? )?(entscheidung|offene frage|frage)\b\s*(?:hinzu|auf|ein)?\s*[:,\-–]?\s*(.*)$/)) || (m = s.match(/^(entscheidung|offene frage)\s*[:,\-–]\s*(.*)$/))) {
    const roh = text.replace(/^.*?(entscheidung|offene frage|frage)\s*(?:hinzu|auf|ein)?\s*[:,\-–]?\s*/i, "");
    return { aktion: "eintrag-neu", art: m[1] === "entscheidung" ? "entscheidung" : "frage", text: roh.replace(/^[\s:,\-–]+|[\s]+$/g, "") };
  }
  // "Was kann/macht der Vertriebsexperte?" → feste Kurzantwort zur Rolle des Agenten
  if ((m = s.match(/^(?:was|wie|wozu) (?:kann|können|koennen|macht|machen|tut|tun|leistet|leisten|ist|sind|hilft|helfen)\w* (?:denn |eigentlich )?(?:der |die |das |unser |unsere |ein |eine )?(.+?)(?: eigentlich| denn| so| genau)?(?: (?:alles|noch|bei uns))?$/))) {
    const w = m[1]!;
    if (/(agenten|experten|spezialisten|drei)/.test(w) && !/(vertrieb|sales|bpm|prozess|\bki\b|ki-|automatisier)/.test(w)) return { aktion: "agenten-rolle", wer: "alle" };
    if (/^(?:ki|k i)[ -]?agenten$/.test(w)) return { aktion: "agenten-rolle", wer: "alle" };
    if (/vertrieb|sales|verkauf/.test(w)) return { aktion: "agenten-rolle", wer: "sales" };
    if (/bpm|prozess/.test(w)) return { aktion: "agenten-rolle", wer: "bpm" };
    if (/\bki\b|ki-|k i |automatisier/.test(w) && /(experte|expert|spezialist|berater|consultant|automatisier)/.test(w)) return { aktion: "agenten-rolle", wer: "consultant" };
  }
  // "Was sagt der BPM Spezialist dazu?" → Frage zur letzten Aussage im Meeting
  if ((m = s.match(/^(?:was|wie) (?:sagt|meint|denkt|findet|sieht)\w* (?:denn )?(?:der |die |das |unser |unsere )?(.+?) (?:dazu|dazu jetzt|zu dem|zu dieser aussage|zu dem punkt)$/)) || (m = s.match(/^frage (?:den |die |das )?(.+?) dazu$/)) || (m = s.match(/^(?:was )?(?:meinen|sagen) (?:die |unsere )?(experten|agenten|spezialisten|alle) dazu$/))) return { aktion: "frage-dazu", an: m[1]! };
  if (/frage an /.test(s)) {
    const [adressat, ...rest] = text.replace(/^.*?frage an\s*/i, "").split(/[:,]/);
    const frage = rest.join(",").trim();
    if (frage) return { aktion: "frage", an: (adressat ?? "alle").replace(/^(den|die|das)\s+/i, "").trim(), text: frage };
  }
  const einstellung = findeEinstellung(s);
  if (einstellung) return { aktion: "einstellung", ziel: einstellung };
  // To-dos per Stimme: abhaken, ändern, löschen (Löschen fragt der Browser vorher nach)
  if ((m = s.match(/^(?:hake|hak) (?:das |den |die )?(?:to ?dos? )?(.+?) ab$/)) || (m = s.match(/^(?:das |den |die )?(?:to ?dos? )?(.+?) ist (?:erledigt|fertig)$/)) || (m = s.match(/^(?:erledige|erledigt) (?:das |den |die )?to ?dos? (.+)$/)))
    return { aktion: "todo-erledigt", todo: m[1]! };
  if ((m = s.match(/^(?:ändere|aendere|setze|stelle) (?:beim |bei dem |bei |das |den |die )?(?:to ?dos? )?(.+?) (?:die |den )?(frist|owner|besitzer|verantwortliche[rn]?) (?:auf|zu|um auf) (.+)$/)) && /to ?do/.test(s)) {
    const wert = m[3]!.trim().replace(/(^|\s)(\S)/g, (_, vor: string, buchstabe: string) => vor + buchstabe.toUpperCase()); // "ende november" → "Ende November"
    return /^frist/.test(m[2]!) ? { aktion: "todo-aendern", todo: m[1]!, frist: wert } : { aktion: "todo-aendern", todo: m[1]!, owner: wert };
  }
  if ((m = s.match(/^(?:benenne|ändere|aendere) (?:das )?to ?dos? (.+?) (?:um )?(?:in|zu) (.+)$/))) return { aktion: "todo-aendern", todo: m[1]!, text: m[2]!.trim() };
  if (/(lösch|loesch|entfern)/.test(s)) {
    if ((m = s.match(/(?:lösche|loesche|entferne|lösch|loesch) (?:das |den |die )?(?:to ?dos? )?(.+)$/)) && /to ?do/.test(s)) return { aktion: "todo-loeschen", todo: m[1]! };
    return { aktion: "loeschen" };
  }
  if (/^(ignorier\w*|schon gut|vergiss das|vergiss es)( |$)/.test(s)) return { aktion: "nein" };
  // "Zurück zum Meeting", "Bring mich zurück ins Meeting", "Ich will wieder ins Meeting", "Zurück zum laufenden Workshop"
  if (/^(zurück|zurueck)$/.test(s) || (/(zurück|zurueck|wieder)/.test(s) && /(meeting|workshop|besprechung|assistent)/.test(s) && !/(auswahl|start|übersicht|uebersicht|neue[nsr]?)/.test(s) && !finde(meetings(), s, 0.6) && !finde(workshops.liste(), s, 0.6)))
    return { aktion: "zurueck" };
  if (/(dokument|unterlage|datei|material|interview|einreichung)/.test(s) && /(zeig|öffne|oeffne|finde|such|wo |welche|liste|anzeigen|ansehen|gibt es|hol)/.test(s) && !/zusammenfass/.test(s)) return { aktion: "material", text };
  if ((m = s.match(/(letzte[nm]?|neueste[nm]?|meine[nm]?|alle[nm]?|unsere[nm]?|bisherige[nm]?|welche) (meetings|workshops|besprechungen)( und (meetings|workshops))?/)) || (m = s.match(/zeig.* (meetings|workshops)( und (meetings|workshops))?$/))) {
    return { aktion: "liste", art: /meetings|besprechungen/.test(s) && /workshops/.test(s) ? "alle" : /workshops/.test(s) ? "workshops" : "meetings" };
  }
  if (/^(hilfe|was kannst du|welche befehle|was geht)/.test(s)) return { aktion: "hilfe" };
  // Antwort auf Merlins Rückfrage ("Soll ich …?"): nur kurze Sätze, sonst ist es ein neuer Befehl
  if (s.split(" ").length <= 4) {
    if (/^(ja|jawohl|genau|gerne|gern|klar|sicher|richtig)( |$)|^(mach das|mach es|bitte ja|bitte mach das)$/.test(s)) return { aktion: "ja" };
    if (/^(nein|nee|ne|nö|lieber nicht|nicht|abbrechen|doch nicht|vergiss es|egal)( |$)/.test(s)) return { aktion: "nein" };
  }
  if (/wie spät|wie spaet|wie ?viel uhr|uhrzeit|welche zeit haben wir/.test(s)) return { aktion: "uhrzeit" };
  // Schließen: egal ob Meeting oder Workshop, geschlossen wird das gerade geöffnete
  const art = "(meeting|sitzung|besprechung|workshop)";
  if (new RegExp(`${art} (schliessen|abschliessen|beenden|zumachen)|(schliesse|schliess|beende|mach) (das |den |die )?(aktuelle[n]? |laufende[n]? |offene[n]? )?${art}( zu)?$`).test(s) && !/aufnahme|transkription/.test(s)) return { aktion: "meeting-schliessen" };
  // Pausieren: nur die Aufnahme hält an, Meeting bzw. Workshop bleibt offen
  if (new RegExp(`(pausiere|unterbrich|unterbreche|halte|stoppe|stoppen|stopp) (das |den |die )?(aktuelle[n]? |laufende[n]? )?${art}|${art} (pausieren|unterbrechen|anhalten)`).test(s)) return { aktion: "aufnahme-pause" };
  if (/((aufnahme|transkription|aufzeichnung|mitschrift)\w* (starten|start|beginnen|fortsetzen|los))|((starte?|beginne|setz\w*) (die |mit der )?(aufnahme|transkription|aufzeichnung|mitschrift))|^(mitschreiben|nimm auf|aufnehmen)/.test(s))
    return { aktion: "aufnahme-start" };
  if (/((aufnahme|transkription|aufzeichnung|mitschrift)\w* (stoppen|stopp|stop|pausieren|pause|beenden|anhalten))|((stoppe|pausiere|beende|halte) (die )?(aufnahme|transkription|aufzeichnung|mitschrift))|^(pause|stopp|stop|pausieren)$|machen (eine |kurz )?pause|kaffeepause/.test(s))
    return { aktion: "aufnahme-pause" };
  // To-dos über die Bubble: anlegen und verschieben (wirkt sofort; die Aufnahme ist beim Zuhören stumm, also kein Doppel)
  if (/^(neue[snr]? to ?do|to ?do (für|fuer|an) |notiere (ein |das |als )?to ?do|nimm (ein |das )?to ?do auf|schreib (ein |das )?to ?do|leg (ein |das )?(neues )?to ?do an|f(ü|ue)g(e|t)? (ein |das |mal )*(neues |neuen )?(to ?dos?|tool|tu ?dus?) hinzu|(erstell|anleg|leg|erfass|mach)\w* (ein |das |mal |uns |mir )*(neues |neuen )?(to ?dos?|tool|tu ?dus?)|(to ?dos?|tool|tu ?dus?) (erstellen|anlegen|hinzuf(ü|ue)gen|erfassen|notieren|aufnehmen)|to ?do:)/.test(s) || /^neue[snr]? to ?do/.test(s)) {
    const t = zerlegeTodo(text);
    return { aktion: "todo-neu", text: t.text, owner: t.owner, frist: t.frist };
  }
  if ((m = s.match(/^(?:verschiebe?|schieb(?:e)?)\s+(?:das |die )?(?:to ?dos? )?(.+?)\s+(?:zum|zur|zu|nach|in den|ins|in|auf den|auf|unter den|unter)\s+(.+)$/)) && !/aufnahme|meeting|workshop|termin/.test(s))
    return { aktion: "todo-verschieben", todo: m[1]!, ziel: m[2]! };
  // Fachfrage zum Material des geöffneten Workshops ("Wie sieht der Ist-Prozess aus?")
  if (/^(wie|was|welche[nrs]?|wer|wo|wann|warum|wieso|weshalb|gibt es|haben wir|erklär|erklaer|erzähl|erzaehl|beschreib|fass)/.test(s) && !/(öffne|oeffne|zeig|bring|wechsel|geh |gehe |agenda|material|eingereicht|vorbereitung|regeln|begrü|begru|aufnahme|einstell)/.test(s) && hatWissen())
    return { aktion: "wissen", frage: text.trim() };
  if (/neue[ns]? (meeting|besprechung)/.test(s)) {
    const name = text.match(/neue[ns]?\s+(?:meeting|besprechung)\s*(?:anlegen|einrichten|erstellen|starten|öffnen|machen)?\s*(?:namens|mit dem namen|mit namen|zum thema|für|zu)?\s*[:,]?\s*(.*)$/i)?.[1] ?? "";
    return { aktion: "meeting-neu", name: name.replace(/[.!?]+$/, "").replace(/^(anlegen|einrichten|erstellen|bitte|an|ein|auf)$/i, "").trim() };
  }
  if (/neue[nrs]? workshop/.test(s)) return { aktion: "workshop-neu" };
  if ((m = s.match(/(?:öffne|oeffne|zeig(?:e)?|wechsel(?:e|n)? zu(?:m|r)?|geh(?:e)? zu(?:m|r)?|lade) (?:das |den |die )?(meeting|workshop) (.+)$/))) {
    return m[1] === "workshop" ? { aktion: "workshop-oeffnen", name: m[2]! } : { aktion: "meeting-oeffnen", name: m[2]! };
  }
  // Name eines Meetings oder Workshops irgendwo im Satz ("Bring mich zu Jour fixe", "Meeting Jour fixe öffnen")
  const absicht = /(öffne|oeffne|bring|führ|fuehr|geh|wechsel|wechsle|zeig|lade|möchte|moechte|will|zurück|zurueck|^zu|^zum|^ins|meeting|workshop|besprechung)/.test(s);
  if (absicht && !/agenda|begrü|begru|material|regeln|agenten|pinnwand|archiv|admin|regie/.test(s)) {
    const w = finde(workshops.liste(), s, /workshop/.test(s) ? 0.5 : 0.6);
    const t = finde(meetings(), s, /meeting|besprechung/.test(s) ? 0.5 : 0.6);
    if (w && (!t || /workshop/.test(s))) return { aktion: "workshop-oeffnen", name: w.name };
    if (t) return { aktion: "meeting-oeffnen", name: t.name };
  }
  if (/(letzte[snm]?|vorige[snm]?|von gestern|zuletzt) (meeting|besprechung)|(meeting|besprechung) von gestern/.test(s)) return { aktion: "meeting-oeffnen", name: "@letztes" };
  if (/(bestehende[snm]?|vorhandene[snm]?|alte[snm]?|andere[snm]?|anderen) (meeting|besprechung)|meeting (auswählen|auswaehlen|wechseln)/.test(s)) return { aktion: "gehe", ziel: "meeting" };
  if (/(bestehende[snm]?|vorhandene[snm]?|anderen?) workshop|workshop (auswählen|auswaehlen|wechseln)/.test(s)) return { aktion: "gehe", ziel: "workshop" };
  if (/begrü|begru|begrüss|willkommen/.test(s)) return { aktion: "ansage", station: "begruessung" };
  if (/agenda/.test(s) && !/(meeting|workshop) /.test(s)) return { aktion: "ansage", station: "agenda" };
  if (/(material|eingereicht|vorbereitung|zusammenfass)/.test(s)) return { aktion: "ansage", station: "eingereicht" };
  if (/regeln|spielregeln/.test(s)) return { aktion: "ansage", station: "regeln" };
  if (/pinnwand|pinwand|materialwand|ideenwand/.test(s)) return { aktion: "gehe", ziel: "pinnwand" };
  if (/agenten|experten|spezialisten/.test(s)) return { aktion: "gehe", ziel: "agenten" };
  if (/assistent|protokoll|to ?dos?|mitschrift/.test(s)) return { aktion: "gehe", ziel: "assistent" };
  if (/archiv/.test(s)) return { aktion: "gehe", ziel: "archiv" };
  if (/admin|einstellungen/.test(s)) return { aktion: "gehe", ziel: "admin" };
  if (/regie/.test(s)) return { aktion: "gehe", ziel: "regie" };
  if (/start|anfang|auswahl|übersicht|uebersicht|hauptfenster|hauptseite|hauptscreen/.test(s)) return { aktion: "gehe", ziel: "start" };
  if (/workshops?( öffnen| oeffnen| wählen)?$/.test(s)) return { aktion: "gehe", ziel: "workshop" };
  if (/meetings?( öffnen| oeffnen| wählen)?$/.test(s)) return { aktion: "gehe", ziel: "meeting" };
  // "Öffne …" mit unbekanntem Namen (z. B. verhört): nachfragen statt raten
  if ((m = s.match(/^(?:öffne|oeffne|bring mich zu(?:m|r)?|führe? mich zu(?:m|r)?|geh(?:e)? zu(?:m|r)?|wechsel(?:e)? zu(?:m|r)?|lade) (?:das |den |die )?(.+)$/))) return { aktion: "meeting-oeffnen", name: m[1]! };
  return null;
}

/** Kurzer Kontext für das Sprachmodell (nur, wenn keine Regel gegriffen hat). */
export function kontextFuerModell(bereich: string): string {
  return [
    `Aktueller Bereich: ${bereich}`,
    `Geöffnetes Meeting: ${store.istOffen ? store.daten.name : "keins"}`,
    `Meetings: ${meetings().slice(0, 15).map((t) => t.name).join("; ") || "keine"}`,
    `Workshops: ${workshops.liste().slice(0, 15).map((w) => w.name).join("; ") || "keine"}`,
    `Agenten: ${agentenFuer(store.daten.agenten).map((a) => a.name).join("; ")}`,
  ].join("\n");
}

const NAMEN: Record<(typeof ZIELE)[number], string> = { start: "zur Auswahl", meeting: "zu den Meetings", workshop: "zu den Workshops", assistent: "zum Meeting Assistenten", agenten: "zu den Agenten", pinnwand: "zur Pinnwand", archiv: "ins Archiv", admin: "in den Admin", regie: "in die Regie" };
const STATION_TEXT: Record<(typeof STATIONEN)[number], string> = { begruessung: "Ich begrüße alle.", eingereicht: "Ich fasse das eingereichte Material zusammen.", regeln: "Ich erkläre die Regeln.", agenda: "Ich lese die Agenda vor." };

/** Vorgesprochener Text für den Workshop-Start. Hier ändern, Merlin liest ihn unverändert vor (auch im Freihand-Modus, ungekürzt). */
export const TAGESABLAUF_TEXT =
  "Heute geht es um das Thema Sales Agentic Workshop. Unser Zielbild: KI übernimmt eine zentrale Rolle im Vertriebsprozess. Davon erhoffen wir uns mehr Produktivität, weil Verkaufschancen gezielt erkannt und vermittelt werden. Mehr Geschwindigkeit, weil wir durch Automation und KI schneller Aktionen einleiten können. Und natürlich mehr Umsatz, weil wir durch den KI-Einsatz qualifizierte Abschlüsse erhöhen. " +
  "Um das zu erreichen, haben wir vier Schritte auf unserer Agenda. Eins: Ist-Analyse, verlorene Chancen und Zeitverluste identifizieren. Zwei: Neu denken, den idealen Arbeitsalltag und die Rollen entwerfen. Drei: Den Soll-Prozess schrittweise gestalten und dabei die Machbarkeit berücksichtigen. Und vier: Umsetzung, Aufgabenboard und Prioritäten setzen. " +
  "Die KI begleitet euch dabei, so weit es geht: Das Protokoll wird aufgenommen, To-dos werden erkannt, ihr könnt die Agenten befragen, und am Ende gibt es eine saubere Zusammenfassung. Viel Spaß dabei!";

export const HILFE =
  "Du kannst mich zum Beispiel bitten: „Neues Meeting“, „Öffne den Workshop …“, „Zeig die letzten Meetings“, „Zurück zum Meeting“, „Aufnahme starten“, „Pause“, „Zu den Agenten“, „Lies die Agenda vor“, „Begrüße alle“, „Was haben wir an Material?“, „Wie sieht der Ist-Prozess aus?“, „Öffne das Dokument …“, „Öffne die Pinnwand“, „Wie spät ist es?“, „Schließe den Workshop“, „Neues To-do für Anna: CRM-Export bis Freitag“, „Verschiebe das To-do CRM-Export zu Punkt 3“, „Hake CRM-Export ab“, „Setze beim To-do CRM-Export die Frist auf Montag“, „Lösche das To-do CRM-Export“ (mit Rückfrage), „Wo ändere ich die Lesegeschwindigkeit?“, „Starte Punkt 2“, „Weiter zum nächsten Punkt“, „Rückgängig“, „Notiere eine Entscheidung: …“, „Stell einen Timer auf 10 Minuten“, „Was sagt der BPM Spezialist dazu?“, „Wie ist der Tagesablauf?“, „Erklär uns die App“ (nur ohne geöffnetes Meeting) oder „Frage an den Vertriebsexperten: …“. Löschen kann ich nicht, das geht nur per Klick.";

/** Feste Antworten auf „Was kann der …?“ (vom Workshop-Team vorgegeben, Merlin liest sie unverändert vor). */
export const ROLLEN = {
  sales: "Der Vertriebsexperte kennt die Pain Points und erkennt Chancen.",
  bpm: "Der BPM-Experte vergleicht die Prozesse. Er schlägt Prozessverbesserungen für einzelne Bereiche vor und, wo es möglich ist, auch für alle Bereiche gemeinsam.",
  consultant: "Der KI-Experte leitet Lösungen ab und schaut, wo er sie verknüpfen kann. Außerdem gibt er weitere Impulse zum KI-Einsatz.",
  alle: "Wir haben drei Agenten. Der Vertriebsexperte kennt die Pain Points und erkennt Chancen. Der BPM-Experte vergleicht die Prozesse und schlägt Verbesserungen vor, für einzelne Bereiche und wo möglich für alle gemeinsam. Der KI-Experte leitet Lösungen ab, verknüpft sie und gibt weitere Impulse zum KI-Einsatz.",
} as const;

const AGENT_STOPP =new Set(["und", "der", "die", "das", "den", "dem", "experte", "experten", "spezialist", "spezialisten", "agent", "agenten"]);
/** Suchwörter für einen Agenten: Wörter des Namens, Wortstämme ("Vertriebsexperte" → "vertrieb") und feste Zusatzbegriffe der Standardagenten. */
function agentenWoerter(a: { id: string; name: string }): string[] {
  const woerter = klein(a.name).split(" ").filter((w) => !AGENT_STOPP.has(w));
  const stamm = woerter.map((w) => w.replace(/experte$/, "").replace(/s$/, "")).filter((w) => w.length >= 5);
  const zusatz: Record<string, string[]> = { sales: ["vertrieb", "sales", "verkauf"], bpm: ["bpm", "prozess"], consultant: ["automatisierung", "ki", "technik"] };
  return [...new Set([...woerter, ...stamm, ...(zusatz[a.id] ?? [])])];
}
/** "Vertriebsexperte", "den Vertrieb", "KI-Experte", "BPM", "Prozessexperte" → der passende Agent (oder nichts). */
export function findeAgent<T extends { id: string; name: string }>(agenten: T[], gesucht: string): T | undefined {
  const g = klein(gesucht);
  const teile = g.split(" ");
  return agenten.find((a) => agentenWoerter(a).some((w) => (w.length <= 3 ? teile.includes(w) : g.includes(w))));
}

/** Prüft den Befehl gegen den Zustand der App und löst Namen in IDs auf. */
export function aufloesen(b: Befehl, aufnahmeLaeuft: boolean): Ergebnis {
  switch (b.aktion) {
    case "gehe": {
      if ((b.ziel === "assistent" || b.ziel === "agenten") && !store.istOffen) {
        const auswahl = auswahlMeetings();
        return { aktion: "gehe", ziel: "meeting", antwort: auswahl.length ? "Es ist noch kein Meeting geöffnet. Welches soll ich öffnen?" : "Es ist noch kein Meeting geöffnet. Leg hier ein neues an.", auswahl };
      }
      if (b.ziel === "pinnwand" && !offenerWorkshop()) return { aktion: "gehe", ziel: "workshop", antwort: "Die Pinnwand gehört zu einem Workshop. Welchen soll ich öffnen?", auswahl: auswahlWorkshops() };
      if (b.ziel === "meeting") {
        const auswahl = auswahlMeetings();
        return { aktion: "gehe", ziel: "meeting", antwort: auswahl.length ? "Hier sind die Meetings. Welches soll ich öffnen?" : "Es gibt noch kein Meeting. Leg hier ein neues an.", auswahl };
      }
      if (b.ziel === "workshop") {
        const auswahl = auswahlWorkshops();
        return { aktion: "gehe", ziel: "workshop", antwort: auswahl.length ? "Hier sind die Workshops. Welchen soll ich öffnen?" : "Es gibt noch keinen Workshop. Richte hier einen neuen ein.", auswahl };
      }
      return { aktion: "gehe", ziel: b.ziel, antwort: `Ich gehe ${NAMEN[b.ziel]}.` };
    }
    case "meeting-neu":
      if (aufnahmeLaeuft) return { aktion: "hinweis", antwort: "Gerade läuft eine Aufnahme. Bitte erst pausieren, dann lege ich ein neues Meeting an." };
      return { aktion: "meeting-neu", name: b.name ?? "", antwort: b.name ? `Ich richte das Meeting „${b.name}“ ein. Ergänze Datum und Agenda.` : "Ich öffne ein neues Meeting. Wie soll es heißen?" };
    case "workshop-neu":
      return { aktion: "workshop-neu", antwort: "Ich öffne einen neuen Workshop zum Einrichten." };
    case "meeting-oeffnen": {
      const t = b.name === "@letztes" ? (meetings().filter((x) => !x.abgeschlossen).sort((x, y) => y.datum.localeCompare(x.datum))[0] ?? null) : (meetings().find((x) => x.name === b.name) ?? finde(meetings(), b.name, 0.5));
      if (!t) {
        const w = finde(workshops.liste(), b.name, 0.5);
        if (w) return { aktion: "workshop-oeffnen", id: w.id, antwort: `„${w.name}“ ist ein Workshop. Ich öffne ihn.` };
        return { aktion: "gehe", ziel: "meeting", antwort: b.name === "@letztes" ? "Es gibt noch kein offenes Meeting." : `Ein Meeting „${b.name}“ habe ich nicht gefunden. Meinst du eins von diesen?`, auswahl: auswahlMeetings() };
      }
      if (aufnahmeLaeuft && store.daten.id !== t.id) return { aktion: "hinweis", antwort: "Gerade läuft eine Aufnahme in einem anderen Meeting. Bitte erst pausieren." };
      return { aktion: "meeting-oeffnen", id: t.id, antwort: `Ich öffne „${t.name}“.` };
    }
    case "workshop-oeffnen": {
      const w = workshops.liste().find((x) => x.name === b.name) ?? finde(workshops.liste(), b.name, 0.5);
      if (!w) return { aktion: "gehe", ziel: "workshop", antwort: `Einen Workshop „${b.name}“ habe ich nicht gefunden. Meinst du einen von diesen?`, auswahl: auswahlWorkshops() };
      if (aufnahmeLaeuft && store.daten.id !== w.meetingId) return { aktion: "hinweis", antwort: "Gerade läuft eine Aufnahme in einem anderen Meeting. Bitte erst pausieren." };
      return { aktion: "workshop-oeffnen", id: w.id, antwort: `Ich öffne den Workshop „${w.name}“.` };
    }
    case "aufnahme-start":
      if (!store.istOffen) return { aktion: "gehe", ziel: "meeting", antwort: "Dafür brauche ich zuerst ein Meeting. Welches soll ich öffnen?", auswahl: auswahlMeetings() };
      if (aufnahmeLaeuft) return { aktion: "hinweis", antwort: "Die Aufnahme läuft schon." };
      return { aktion: "aufnahme-start", antwort: "Ich starte die Aufnahme." };
    case "aufnahme-pause":
      if (!aufnahmeLaeuft) return { aktion: "hinweis", antwort: "Gerade läuft keine Aufnahme." };
      return { aktion: "aufnahme-pause", antwort: "Ich pausiere die Aufnahme." };
    case "meeting-schliessen": {
      if (!store.istOffen) return { aktion: "hinweis", antwort: "Es ist gerade weder ein Meeting noch ein Workshop geöffnet." };
      const w = offenerWorkshop();
      return { aktion: "meeting-schliessen", antwort: `Soll ich ${w ? `den Workshop „${w.name}“` : `das Meeting „${store.daten.name}“`} schließen? Alles wird gespeichert und liegt danach im Archiv.` };
    }
    case "ansage":
      if (!store.istOffen) return { aktion: "gehe", ziel: "meeting", antwort: "Dafür brauche ich ein geöffnetes Meeting. Welches soll ich öffnen?", auswahl: auswahlMeetings() };
      if (b.station === "agenda" && !store.daten.protokoll.agenda.length) {
        const w = offenerWorkshop();
        return { aktion: "agenda-fehlt", workshop: !!w, antwort: `Für ${w ? "diesen Workshop" : "dieses Meeting"} gibt es noch keine Agenda. Soll ich dich hinbringen, damit du eine anlegen kannst?` };
      }
      return { aktion: "ansage", station: b.station, antwort: STATION_TEXT[b.station] };
    case "todo-neu": {
      if (!store.istOffen) return { aktion: "gehe", ziel: "meeting", antwort: "Für ein To-do brauche ich ein geöffnetes Meeting. Welches soll ich öffnen?", auswahl: auswahlMeetings() };
      if (!b.text.trim()) return { aktion: "todo-text-fehlt", antwort: "Was soll ich als To-do notieren?" };
      const punkt = store.daten.protokoll.agenda.find((a) => a.status === "läuft");
      const owner = b.owner?.trim() || "offen";
      const frist = b.frist?.trim() || "offen";
      const details = [owner !== "offen" ? `für ${owner}` : "", frist !== "offen" ? `bis ${frist}` : ""].filter(Boolean).join(", ");
      return { aktion: "todo-neu", text: b.text.trim(), owner, frist, agendapunkt: punkt?.id ?? "", antwort: `Notiert: ${b.text.trim()}${details ? `, ${details}` : ""}.` };
    }
    case "todo-verschieben": {
      if (!store.istOffen) return { aktion: "hinweis", antwort: "Es ist gerade kein Meeting geöffnet." };
      const todos = store.daten.protokoll.todos.map((t) => ({ name: t.text, id: t.id }));
      const todo = finde(todos, b.todo, 0.5);
      if (!todo) return { aktion: "hinweis", antwort: `Ein To-do „${b.todo}“ habe ich nicht gefunden. Sag mir ein Stichwort aus dem To-do.` };
      const punkt = findeAgendapunkt(b.ziel);
      if (!punkt) return { aktion: "hinweis", antwort: `Den Agendapunkt „${b.ziel}“ habe ich nicht gefunden. Sag zum Beispiel „zu Punkt 2“ oder nenne den Titel.` };
      return { aktion: "todo-verschieben", id: todo.id, agendapunkt: punkt.id, antwort: `Ich habe „${todo.name}“ verschoben: ${punkt.id ? `jetzt bei „${punkt.titel}“` : "jetzt ohne Agendapunkt"}.` };
    }
    case "todo-erledigt":
    case "todo-aendern":
    case "todo-loeschen": {
      if (!store.istOffen) return { aktion: "hinweis", antwort: "Es ist gerade kein Meeting geöffnet." };
      const todos = store.daten.protokoll.todos.map((t) => ({ name: t.text, id: t.id }));
      const todo = finde(todos, b.todo, 0.5);
      if (!todo) return { aktion: "hinweis", antwort: `Ein To-do „${b.todo}“ habe ich nicht gefunden. Sag mir ein Stichwort aus dem To-do.` };
      if (b.aktion === "todo-erledigt") return { aktion: "todo-erledigt", id: todo.id, antwort: `Abgehakt: „${todo.name}“.` };
      if (b.aktion === "todo-loeschen") return { aktion: "todo-loeschen", id: todo.id, antwort: `Soll ich das To-do „${todo.name}“ löschen?` };
      if (!b.text && !b.owner && !b.frist) return { aktion: "hinweis", antwort: "Was soll ich ändern? Sag zum Beispiel: Setze beim To-do Preisliste die Frist auf Montag." };
      const was = [b.text ? `Text: ${b.text}` : "", b.owner ? `Owner: ${b.owner}` : "", b.frist ? `Frist: ${b.frist}` : ""].filter(Boolean).join(", ");
      return { aktion: "todo-aendern", id: todo.id, text: b.text, owner: b.owner, frist: b.frist, antwort: `Geändert bei „${todo.name}“: ${was}.` };
    }
    case "uhrzeit":
      return { aktion: "hinweis", antwort: `Es ist ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} Uhr.` };
    case "agenten-rolle":
      return { aktion: "hinweis", antwort: ROLLEN[b.wer] };
    case "ja":
    case "nein":
      return { aktion: b.aktion, antwort: "" };
    case "wissen":
      if (!store.istOffen) return { aktion: "gehe", ziel: "workshop", antwort: "Dafür brauche ich einen geöffneten Workshop. Welchen soll ich öffnen?", auswahl: auswahlWorkshops() };
      if (!hatWissen()) return { aktion: "hinweis", antwort: "Zu diesem Meeting gibt es noch kein Material, aus dem ich antworten kann." };
      return { aktion: "wissen", frage: b.frage, antwort: "" }; // die Antwort schreibt der Server mit dem Sprachmodell
    case "frage": {
      if (!store.istOffen) return { aktion: "gehe", ziel: "meeting", antwort: "Für Fragen an die Agenten brauche ich ein geöffnetes Meeting. Welches soll ich öffnen?", auswahl: auswahlMeetings() };
      const dabei = agentenFuer(store.daten.agenten);
      const gesucht = klein(b.an);
      const agent = /^(alle|allen|die experten|die runde|alle agenten)$/.test(gesucht) ? null : findeAgent(dabei, gesucht);
      if (!agent && !/alle|experten|runde/.test(gesucht)) return { aktion: "frage", an: "alle", text: b.text, antwort: `„${b.an}“ ist nicht dabei. Ich gebe die Frage an alle Agenten.` };
      return { aktion: "frage", an: agent?.id ?? "alle", text: b.text, antwort: agent ? `Ich frage den ${agent.name}.` : "Ich frage alle Agenten." };
    }
    case "einstellung": {
      const e = EINSTELLUNGEN[b.ziel];
      return { aktion: "einstellung", bereich: e.bereich, feld: e.feld, antwort: `Ich bringe dich ${e.name}: ${BEREICH_NAME[e.bereich]}.` };
    }
    case "liste": {
      const auswahl = b.art === "workshops" ? auswahlWorkshops() : b.art === "alle" ? [...auswahlLetzteMeetings(4), ...auswahlWorkshops().slice(0, 3).map((a) => ({ ...a, text: `Workshop: ${a.text}` }))] : auswahlLetzteMeetings(6);
      if (!auswahl.length) return { aktion: "hinweis", antwort: b.art === "workshops" ? "Es gibt noch keinen Workshop." : "Es gibt noch kein Meeting." };
      return { aktion: "hinweis", antwort: b.art === "workshops" ? "Das sind die Workshops. Ein Klick öffnet einen." : "Das sind die letzten Einträge. Ein Klick öffnet sie, abgeschlossene im Archiv.", auswahl };
    }
    case "zurueck": {
      if (!store.istOffen) return { aktion: "gehe", ziel: "meeting", antwort: "Gerade ist kein Meeting geöffnet. Welches soll ich öffnen?", auswahl: auswahlMeetings() };
      const w = workshops.liste().find((x) => x.meetingId === store.daten.id);
      return { aktion: "gehe", ziel: "assistent", antwort: w ? `Zurück zum Workshop „${w.name}“.` : `Zurück zu „${store.daten.name}“.` };
    }
    case "material": {
      const f = findeMaterial(b.text);
      if (f.einzeln) return { aktion: "dokument", titel: f.einzeln.titel, link: f.einzeln.link, antwort: f.antwort };
      return { aktion: "hinweis", antwort: f.antwort, auswahl: f.auswahl };
    }
    case "fuehrung":
      // Nur ohne laufende Aufnahme. Ein offenes, aber pausiertes Meeting stört nicht: die Führung bleibt auf dem Startscreen.
      if (aufnahmeLaeuft) return { aktion: "hinweis", antwort: "Gerade läuft eine Aufnahme. Pausiere sie, dann zeige ich euch die App." };
      return { aktion: "fuehrung", antwort: "Gern. Ich zeige euch die App." };
    case "aufwaermen":
      // Wie die Führung: nicht bei laufender Aufnahme (ein zweites Fenster würde nichts aufnehmen, aber das Meeting nicht stören)
      if (aufnahmeLaeuft) return { aktion: "hinweis", antwort: "Gerade läuft eine Aufnahme. Pausiere sie, dann starten wir das Aufwärmspiel." };
      return { aktion: "aufwaermen", antwort: "Gern, wir machen ein Warm-up." };
    case "aufwaermen-weiter":
      return { aktion: "aufwaermen-weiter", antwort: "" }; // wirkt nur, wenn das Spiel läuft (public/js/merlin.js)
    case "tagesablauf":      return { aktion: "tagesablauf", antwort: TAGESABLAUF_TEXT };
    case "timer":
      if (!b.sekunden) return { aktion: "hinweis", antwort: "Wie lange soll der Timer laufen? Sag zum Beispiel: Stell einen Timer auf 10 Minuten." };
      return { aktion: "timer", sekunden: b.sekunden, antwort: `Timer läuft: ${dauerText(b.sekunden)}.` };
    case "timer-stopp":
      return { aktion: "timer-stopp", antwort: "Der Timer ist gestoppt." };
    case "rueckgaengig":
      if (!store.istOffen) return { aktion: "hinweis", antwort: "Es ist gerade kein Meeting geöffnet." };
      return { aktion: "rueckgaengig", antwort: "" }; // der Server macht den letzten Schritt rückgängig und schreibt die Antwort
    case "eintrag-neu": {
      if (!store.istOffen) return { aktion: "gehe", ziel: "meeting", antwort: "Dafür brauche ich ein geöffnetes Meeting. Welches soll ich öffnen?", auswahl: auswahlMeetings() };
      const text = b.text.trim();
      const name = b.art === "entscheidung" ? "Entscheidung" : "Offene Frage";
      if (!text) return { aktion: "hinweis", antwort: `Was soll ich notieren? Sag zum Beispiel: Notiere ${b.art === "entscheidung" ? "eine Entscheidung: Wir starten im Januar" : "eine offene Frage: Wer zahlt das"}.` };
      const punkt = store.daten.protokoll.agenda.find((a) => a.status === "läuft");
      return { aktion: "eintrag-neu", art: b.art, text: text.slice(0, 300), agendapunkt: punkt?.id ?? "", antwort: `${name} notiert: ${text.replace(/[.!?]+$/, "")}.` };
    }
    case "punkt-wechseln": {
      if (!store.istOffen) return { aktion: "gehe", ziel: "meeting", antwort: "Dafür brauche ich ein geöffnetes Meeting. Welches soll ich öffnen?", auswahl: auswahlMeetings() };
      const agenda = store.daten.protokoll.agenda;
      if (!agenda.length) return { aktion: "hinweis", antwort: "Für dieses Meeting gibt es noch keine Agenda." };
      const aktuell = agenda.findIndex((a) => a.status === "läuft");
      let ziel: { id: string; titel: string } | null | undefined;
      if (b.ziel === "@weiter") {
        ziel = agenda[aktuell + 1];
        if (!ziel) return { aktion: "hinweis", antwort: "Das war schon der letzte Punkt der Agenda." };
      } else if (b.ziel === "@zurueck") {
        ziel = aktuell > 0 ? agenda[aktuell - 1] : undefined;
        if (!ziel) return { aktion: "hinweis", antwort: "Es gibt keinen vorherigen Punkt." };
      } else {
        ziel = findeAgendapunkt(b.ziel);
        if (!ziel?.id) return { aktion: "hinweis", antwort: `Den Agendapunkt „${b.ziel}“ habe ich nicht gefunden. Sag zum Beispiel „Starte Punkt 2“.` };
      }
      const index = agenda.findIndex((a) => a.id === ziel!.id);
      if (index === aktuell) return { aktion: "hinweis", antwort: `Punkt ${index + 1} läuft schon.` };
      return { aktion: "punkt-wechseln", id: ziel.id, antwort: `Weiter mit Punkt ${index + 1}: „${ziel.titel}“.` };
    }
    case "frage-dazu": {
      if (!store.istOffen) return { aktion: "gehe", ziel: "meeting", antwort: "Für Fragen an die Agenten brauche ich ein geöffnetes Meeting. Welches soll ich öffnen?", auswahl: auswahlMeetings() };
      const aussage = letzteAussage();
      if (!aussage) return { aktion: "hinweis", antwort: "Es gibt noch keine Aussage im Transkript, zu der ich den Agenten fragen könnte." };
      return aufloesen({ aktion: "frage", an: b.an, text: `Nimm aus deiner Rolle kurz Stellung zur letzten Aussage im Meeting: „${aussage}“` }, aufnahmeLaeuft);
    }
    case "hilfe":
      return { aktion: "hilfe", antwort: HILFE };
    case "loeschen":
      return { aktion: "hinweis", antwort: "Löschen kann ich nicht. Das geht bewusst nur per Klick: To-dos und Einträge im Meeting Assistenten, Meetings und Workshops im Admin." };
    default:
      return { aktion: "unbekannt", antwort: "Das habe ich nicht verstanden. Sag zum Beispiel „Zu den Agenten“ oder „Aufnahme starten“. Mit „Hilfe“ zeige ich dir alles." };
  }
}

/** Fachbegriffe für die Spracherkennung eines Befehls: Namen von Meetings, Workshops und Agenten. */
export function begriffeFuerBefehl(): string[] {
  return [einstellungen.aktivierungswort, ...meetings().slice(0, 20).map((t) => t.name), ...workshops.liste().slice(0, 20).map((w) => w.name), ...einstellungen.agenten.map((a) => a.name)];
}

// ── Freihand: Merlin hört dauernd zu und nimmt nur sein Stichwort ernst ──
const FUELLER = new Set(["hey", "hallo", "ok", "okay", "und", "also", "so", "ja", "dann", "gut", "bitte", "nun", "jetzt", "na"]);

/**
 * Sucht das Aktivierungswort ganz vorne im Satz (höchstens zwei Füllwörter davor).
 * "exakt": "Merlin, öffne die Agenten". "aehnlich": klingt wie das Wort ("Marlin", "Berlin"), da fragt Merlin lieber nach.
 * "rest" ist der Satz nach dem Wort in Originalschreibweise (Namen und Satzzeichen bleiben für To-dos erhalten).
 */
export function stichwort(text: string): { art: "exakt" | "aehnlich" | "keins"; rest: string } {
  const wort = klein(einstellungen.aktivierungswort);
  const roh = text.trim().split(/\s+/).filter(Boolean);
  for (let i = 0; i < Math.min(roh.length, 3); i++) {
    const w = klein(roh[i]!);
    if (i > 0 && !FUELLER.has(klein(roh[i - 1]!))) break;
    const rest = roh.slice(i + 1).join(" ");
    if (w === wort || (w.startsWith(wort) && w.length <= wort.length + 2)) return { art: "exakt", rest };
    if (w.length >= 4 && aehnlich(w, wort) >= 0.7) return { art: "aehnlich", rest };
    if (!FUELLER.has(w)) break;
  }
  return { art: "keins", rest: text };
}

export type Zuruf =
  | { art: "ignoriert" }
  | { art: "gerufen" } // nur der Name: Merlin antwortet "Ja?" und wartet kurz auf den Befehl
  | { art: "antwort"; aktion: "ja" | "nein" } // auf Merlins Rückfrage; alles andere zählt als Nein
  | { art: "befehl"; text: string; sicher: boolean; ki: boolean }; // sicher = Name eindeutig gehört

/**
 * Entscheidet, was ein im Raum gehörter Satz für Merlin bedeutet.
 * stichwort: Normalzustand, nur mit Namen.  folge: Merlin hat "Ja?" gesagt, ein klarer Befehl genügt auch ohne Namen.
 * todo: Merlin hat gefragt, was notiert werden soll.  antwort: Merlin hat nachgefragt, erwartet wird Ja oder Nein (wer weiterredet, sagt damit Nein).
 */
export function deuteZuruf(text: string, modus: "stichwort" | "folge" | "antwort" | "todo"): Zuruf {
  const roh = text.trim();
  if (!roh) return { art: "ignoriert" };
  const w = stichwort(roh);
  if (modus === "todo") {
    // Merlin hat gefragt, was notiert werden soll: der nächste Satz ist das To-do, mit oder ohne Namen davor
    const rest = (w.art === "exakt" ? w.rest : roh).trim();
    return rest ? { art: "befehl", text: `Neues To-do: ${rest}`, sicher: true, ki: false } : { art: "gerufen" };
  }
  if (modus === "antwort") {
    const s = klein(w.art === "keins" ? roh : w.rest);
    if (/^(ja|jawohl|genau|gerne|gern|klar|sicher|richtig|mach das|mach es|bitte ja)( |$)/.test(s) && s.split(" ").length <= 4) return { art: "antwort", aktion: "ja" };
    return { art: "antwort", aktion: "nein" };
  }
  if (w.art === "exakt") return w.rest.trim() ? { art: "befehl", text: w.rest, sicher: true, ki: true } : { art: "gerufen" };
  if (w.art === "aehnlich") return w.rest.trim() && regeln(w.rest) ? { art: "befehl", text: w.rest, sicher: false, ki: false } : { art: "ignoriert" };
  if (modus === "folge") {
    const b = regeln(roh);
    if (b && b.aktion !== "ja" && b.aktion !== "nein") return { art: "befehl", text: roh, sicher: true, ki: false };
  }
  return { art: "ignoriert" };
}
