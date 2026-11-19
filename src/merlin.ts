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
export const ZIELE = ["start", "meeting", "workshop", "assistent", "agenten", "archiv", "admin", "regie"] as const;
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
  z.object({ aktion: z.literal("ja") }),
  z.object({ aktion: z.literal("nein") }),
  z.object({ aktion: z.literal("hilfe") }),
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

/** Feste Regeln. Reihenfolge zählt: spezielle Formulierungen vor allgemeinen. */
export function regeln(text: string): Befehl | null {
  const s = bereinige(text);
  if (!s) return null;
  let m: RegExpMatchArray | null;

  if (/frage an /.test(s)) {
    const [adressat, ...rest] = text.replace(/^.*?frage an\s*/i, "").split(/[:,]/);
    const frage = rest.join(",").trim();
    if (frage) return { aktion: "frage", an: (adressat ?? "alle").replace(/^(den|die|das)\s+/i, "").trim(), text: frage };
  }
  const einstellung = findeEinstellung(s);
  if (einstellung) return { aktion: "einstellung", ziel: einstellung };
  if (/(lösch|loesch|entfern)/.test(s)) return { aktion: "loeschen" };
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
    if (/^(nein|nee|ne|nö|lieber nicht|nicht|abbrechen|doch nicht|vergiss es)( |$)/.test(s)) return { aktion: "nein" };
  }
  if (/wie spät|wie spaet|wie ?viel uhr|uhrzeit|welche zeit haben wir/.test(s)) return { aktion: "uhrzeit" };
  // Schließen: egal ob Meeting oder Workshop, geschlossen wird das gerade geöffnete
  const art = "(meeting|sitzung|besprechung|workshop)";
  if (new RegExp(`${art} (schliessen|abschliessen|beenden|zumachen)|(schliesse|schliess|beende|mach) (das |den |die )?(aktuelle[n]? |laufende[n]? |offene[n]? )?${art}( zu)?$`).test(s) && !/aufnahme|transkription/.test(s)) return { aktion: "meeting-schliessen" };
  // Pausieren: nur die Aufnahme hält an, Meeting bzw. Workshop bleibt offen
  if (new RegExp(`(pausiere|unterbrich|unterbreche|halte) (das |den |die )?(aktuelle[n]? |laufende[n]? )?${art}|${art} (pausieren|unterbrechen|anhalten)`).test(s)) return { aktion: "aufnahme-pause" };
  if (/((aufnahme|transkription|aufzeichnung|mitschrift)\w* (starten|start|beginnen|fortsetzen|los))|((starte|beginne|setze) (die |mit der )?(aufnahme|transkription|aufzeichnung|mitschrift))|^(mitschreiben|nimm auf|aufnehmen)/.test(s))
    return { aktion: "aufnahme-start" };
  if (/((aufnahme|transkription|aufzeichnung|mitschrift)\w* (stoppen|stopp|stop|pausieren|pause|beenden|anhalten))|((stoppe|pausiere|beende|halte) (die )?(aufnahme|transkription|aufzeichnung|mitschrift))|^(pause|stopp|stop|pausieren)$|machen (eine |kurz )?pause|kaffeepause/.test(s))
    return { aktion: "aufnahme-pause" };
  // Fachfrage zum Material des geöffneten Workshops ("Wie sieht der Ist-Prozess aus?")
  if (/^(wie|was|welche[nrs]?|wer|wo|wann|warum|wieso|weshalb|gibt es|haben wir|erklär|erklaer|erzähl|erzaehl|beschreib|fass)/.test(s) && !/(öffne|oeffne|zeig|bring|wechsel|geh |gehe |agenda|material|eingereicht|vorbereitung|regeln|begrü|begru|aufnahme|einstell)/.test(s) && hatWissen())
    return { aktion: "wissen", frage: text.trim() };
  if (/neue[ns]? (meeting|besprechung)/.test(s)) {
    const name = text.match(/neue[ns]?\s+(?:meeting|besprechung)\s*(?:anlegen|einrichten|erstellen|starten|öffnen|machen)?\s*(?:namens|mit dem namen|mit namen|zum thema|für|zu)?\s*[:,]?\s*(.*)$/i)?.[1] ?? "";
    return { aktion: "meeting-neu", name: name.replace(/[.!?]+$/, "").replace(/^(anlegen|einrichten|erstellen|bitte)$/i, "").trim() };
  }
  if (/neue[nrs]? workshop/.test(s)) return { aktion: "workshop-neu" };
  if ((m = s.match(/(?:öffne|oeffne|zeig(?:e)?|wechsel(?:e|n)? zu(?:m|r)?|geh(?:e)? zu(?:m|r)?|lade) (?:das |den |die )?(meeting|workshop) (.+)$/))) {
    return m[1] === "workshop" ? { aktion: "workshop-oeffnen", name: m[2]! } : { aktion: "meeting-oeffnen", name: m[2]! };
  }
  // Name eines Meetings oder Workshops irgendwo im Satz ("Bring mich zu Jour fixe", "Meeting Jour fixe öffnen")
  const absicht = /(öffne|oeffne|bring|führ|fuehr|geh|wechsel|wechsle|zeig|lade|möchte|moechte|will|zurück|zurueck|^zu|^zum|^ins|meeting|workshop|besprechung)/.test(s);
  if (absicht && !/agenda|begrü|begru|material|regeln|agenten|archiv|admin|regie/.test(s)) {
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
  if (/agenten|experten|spezialisten/.test(s)) return { aktion: "gehe", ziel: "agenten" };
  if (/assistent|protokoll|to ?dos?|mitschrift/.test(s)) return { aktion: "gehe", ziel: "assistent" };
  if (/archiv/.test(s)) return { aktion: "gehe", ziel: "archiv" };
  if (/admin|einstellungen/.test(s)) return { aktion: "gehe", ziel: "admin" };
  if (/regie/.test(s)) return { aktion: "gehe", ziel: "regie" };
  if (/start|anfang|auswahl|übersicht|uebersicht/.test(s)) return { aktion: "gehe", ziel: "start" };
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

const NAMEN: Record<(typeof ZIELE)[number], string> = { start: "zur Auswahl", meeting: "zu den Meetings", workshop: "zu den Workshops", assistent: "zum Meeting Assistenten", agenten: "zu den Agenten", archiv: "ins Archiv", admin: "in den Admin", regie: "in die Regie" };
const STATION_TEXT: Record<(typeof STATIONEN)[number], string> = { begruessung: "Ich begrüße alle.", eingereicht: "Ich fasse das eingereichte Material zusammen.", regeln: "Ich erkläre die Regeln.", agenda: "Ich lese die Agenda vor." };

export const HILFE =
  "Du kannst mich zum Beispiel bitten: „Neues Meeting“, „Öffne den Workshop …“, „Zeig die letzten Meetings“, „Zurück zum Meeting“, „Aufnahme starten“, „Pause“, „Zu den Agenten“, „Lies die Agenda vor“, „Begrüße alle“, „Was haben wir an Material?“, „Wie sieht der Ist-Prozess aus?“, „Öffne das Dokument …“, „Wie spät ist es?“, „Schließe den Workshop“, „Wo ändere ich die Lesegeschwindigkeit?“ oder „Frage an den Sales Professional: …“. Löschen kann ich nicht, das geht nur per Klick.";

/** Prüft den Befehl gegen den Zustand der App und löst Namen in IDs auf. */
export function aufloesen(b: Befehl, aufnahmeLaeuft: boolean): Ergebnis {
  switch (b.aktion) {
    case "gehe": {
      if ((b.ziel === "assistent" || b.ziel === "agenten") && !store.istOffen) {
        const auswahl = auswahlMeetings();
        return { aktion: "gehe", ziel: "meeting", antwort: auswahl.length ? "Es ist noch kein Meeting geöffnet. Welches soll ich öffnen?" : "Es ist noch kein Meeting geöffnet. Leg hier ein neues an.", auswahl };
      }
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
    case "uhrzeit":
      return { aktion: "hinweis", antwort: `Es ist ${new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} Uhr.` };
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
      const agent = /^(alle|allen|die experten|die runde|alle agenten)$/.test(gesucht) ? null : dabei.find((a) => klein(a.name).split(" ").some((w) => w.length > 2 && gesucht.includes(w)));
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
