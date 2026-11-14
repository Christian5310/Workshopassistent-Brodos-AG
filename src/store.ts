import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";
import { ProtokollSchema, type ChatNachricht, type Protokoll, type TranskriptAbschnitt } from "./types.ts";

/**
 * Ein Tag = ein Workshop-Tag mit eigener Agenda. Alles, was an diesem Tag entsteht
 * (Protokoll, To-dos, Transkript, Fragen und Antworten), liegt zusammen in einer Datei: data/tage/<id>.json.
 * Damit ist jeder Tag automatisch archiviert; es gibt keinen getrennten Speicherschritt.
 */
export interface Tag {
  id: string;
  name: string;
  /** JJJJ-MM-TT */
  datum: string;
  erstellt: number;
  /** Abgeschlossene Meetings liegen im Archiv und werden im Assistenten nicht mehr zur Auswahl angeboten. */
  abgeschlossen?: boolean;
  geschlossenAm?: number;
  /** Nachweis: wann das Einverständnis der Teilnehmenden bestätigt und die Aufnahme gestartet wurde */
  einwilligungen?: { bestaetigtUm: string; aufnahmeStart: number; wortlaut: string }[];
  /** IDs der Spezial-Agenten, die an diesem Meeting teilnehmen. Fehlt die Angabe, nehmen alle teil. */
  agenten?: string[];
  /** Hintergrundwissen zu diesem Meeting (Kontext für die Spezial-Agenten) */
  briefing: string;
  /** Fachbegriffe und Namen, die die Transkription richtig schreiben soll (mit Komma getrennt) */
  begriffe: string;
  protokoll: Protokoll;
  chat: ChatNachricht[];
  transkript: TranskriptAbschnitt[];
  letzterZyklus: number | null;
  /** Position im Mock-Skript bzw. in den Mock-Fragen (nur Mock-Modus) */
  mockCursor: number;
  mockFragenCursor: number;
}

const basis = path.dirname(config.pfade.daten);
const ordner = path.join(basis, "tage");
const aktivDatei = path.join(basis, "aktiv.json");
const gueltigeId = (id: string) => /^[\w-]+$/.test(id); // verhindert Pfad-Tricks wie "../"
const datei = (id: string) => path.join(ordner, `${id}.json`);
const heute = () => new Date().toLocaleDateString("sv-SE"); // JJJJ-MM-TT in Ortszeit

export function leeresProtokoll(agenda: string[]): Protokoll {
  return {
    agenda: agenda.map((titel, i) => ({ id: `A${i + 1}`, titel, status: "offen" as const })),
    todos: [],
    vorschlaege: [],
    entscheidungen: [],
    offene_fragen: [],
    notizen: [],
  };
}

/** Neue Agenda übernehmen: Punkte mit gleichem Titel behalten ID und Status, neue bekommen eine freie ID. */
function agendaAnwenden(protokoll: Protokoll, titel: string[]): void {
  const alt = protokoll.agenda;
  let zaehler = Math.max(0, ...alt.map((a) => Number(a.id.slice(1)) || 0));
  protokoll.agenda = titel.map((t) => alt.find((a) => a.titel === t) ?? { id: `A${++zaehler}`, titel: t, status: "offen" as const });
}

export const STANDARD_BEGRIFFE = "Brodos, Broki, Merlin, Dynamics, DaaS+";

export interface TagEingabe {
  name: string;
  datum: string;
  agenda: string[];
  briefing?: string;
  begriffe?: string;
}

function neuerTag({ name, datum, agenda, briefing = "", begriffe = STANDARD_BEGRIFFE }: TagEingabe): Tag {
  const kurz = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "tag";
  return {
    id: `${datum}-${kurz}-${randomUUID().slice(0, 4)}`,
    name,
    datum,
    erstellt: Date.now(),
    briefing,
    begriffe,
    protokoll: leeresProtokoll(agenda),
    chat: [],
    transkript: [],
    letzterZyklus: null,
    mockCursor: 0,
    mockFragenCursor: 0,
  };
}

function schreibe(tag: Tag): void {
  fs.mkdirSync(ordner, { recursive: true });
  const tmp = datei(tag.id) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(tag, null, 2));
  fs.renameSync(tmp, datei(tag.id)); // atomar: nie eine halb geschriebene Datei
}

function lies(id: string): Tag | null {
  if (!gueltigeId(id)) return null;
  try {
    const roh = JSON.parse(fs.readFileSync(datei(id), "utf8")) as Tag;
    return { ...roh, briefing: roh.briefing ?? "", begriffe: roh.begriffe ?? STANDARD_BEGRIFFE, protokoll: ProtokollSchema.parse(roh.protokoll) };
  } catch {
    return null;
  }
}

/** Einmalig: Daten aus älteren Versionen (state.json, Archiv-Schnappschüsse) als Tage übernehmen. */
function migriere(): void {
  if (fs.existsSync(ordner)) return;
  fs.mkdirSync(ordner, { recursive: true });
  try {
    const alt = JSON.parse(fs.readFileSync(config.pfade.daten, "utf8"));
    const tag = neuerTag({ name: "Workshop", datum: heute(), agenda: [] });
    schreibe({ ...tag, ...alt, id: tag.id, name: tag.name, datum: tag.datum, protokoll: ProtokollSchema.parse(alt.protokoll) });
    fs.rmSync(config.pfade.daten);
  } catch {
    // keine alten Daten
  }
  const altArchiv = path.join(basis, "archiv");
  if (fs.existsSync(altArchiv)) {
    for (const f of fs.readdirSync(altArchiv).filter((n) => n.endsWith(".json"))) {
      try {
        const e = JSON.parse(fs.readFileSync(path.join(altArchiv, f), "utf8"));
        const tag = neuerTag({ name: String(e.titel), datum: new Date(e.zeit).toLocaleDateString("sv-SE"), agenda: [] });
        schreibe({ ...tag, erstellt: e.zeit, protokoll: ProtokollSchema.parse(e.protokoll), transkript: e.transkript ?? [], chat: e.chat ?? [] });
      } catch {
        // unlesbarer Eintrag: überspringen
      }
    }
    fs.rmSync(altArchiv, { recursive: true, force: true });
  }
}

class Store {
  /** ID des geöffneten Meetings – oder null, wenn gerade keines geöffnet ist. */
  #aktiv: Tag | null = null;
  /** Platzhalter, solange kein Meeting geöffnet ist: leer und wird nie gespeichert. */
  #leer: Tag = { ...neuerTag({ name: "", datum: heute(), agenda: [] }), id: "" };

  constructor() {
    migriere();
    let gemerkt: string | null | undefined;
    try {
      gemerkt = JSON.parse(fs.readFileSync(aktivDatei, "utf8")).id;
    } catch {
      // erster Start: noch nichts gemerkt
    }
    this.#aktiv = gemerkt ? lies(gemerkt) : null;
    if (this.#aktiv?.abgeschlossen) this.#aktiv = null;
  }

  /** Das geöffnete Meeting. Ist keines geöffnet, ein leerer Platzhalter (siehe istOffen). */
  get daten(): Tag {
    return this.#aktiv ?? this.#leer;
  }

  get istOffen(): boolean {
    return this.#aktiv !== null;
  }

  #merkeAktiv(): void {
    fs.mkdirSync(basis, { recursive: true });
    fs.writeFileSync(aktivDatei, JSON.stringify({ id: this.#aktiv?.id ?? null }));
  }

  speichern(): void {
    if (this.#aktiv) schreibe(this.#aktiv);
  }

  /** Alle Meetings, neuestes zuerst. Das geöffnete kommt aus dem Arbeitsspeicher. */
  liste(): Tag[] {
    if (!fs.existsSync(ordner)) return [];
    return fs
      .readdirSync(ordner)
      .filter((f) => f.endsWith(".json"))
      .map((f) => this.hole(f.slice(0, -5)))
      .filter((t): t is Tag => t !== null)
      .sort((a, b) => b.datum.localeCompare(a.datum) || b.erstellt - a.erstellt);
  }

  hole(id: string): Tag | null {
    return this.#aktiv?.id === id ? this.#aktiv : lies(id);
  }

  erstelle(eingabe: TagEingabe): Tag {
    const tag = neuerTag(eingabe);
    schreibe(tag);
    return tag;
  }

  aendere(id: string, e: TagEingabe): Tag | null {
    const tag = this.hole(id);
    if (!tag) return null;
    tag.name = e.name;
    tag.datum = e.datum;
    tag.briefing = e.briefing ?? tag.briefing;
    tag.begriffe = e.begriffe ?? tag.begriffe;
    agendaAnwenden(tag.protokoll, e.agenda);
    schreibe(tag);
    return tag;
  }

  /** Speichert die Agenten-Auswahl eines Meetings, das gerade nicht geöffnet ist. */
  setzeAgenten(id: string, agenten: string[]): void {
    const tag = this.hole(id);
    if (!tag) return;
    tag.agenten = agenten;
    schreibe(tag);
  }

  /** Öffnet ein Meeting im Assistenten. Ein abgeschlossenes wird dabei wieder geöffnet. */
  wechsle(id: string): boolean {
    const tag = lies(id);
    if (!tag) return false;
    this.speichern();
    delete tag.abgeschlossen;
    delete tag.geschlossenAm;
    this.#aktiv = tag;
    this.speichern();
    this.#merkeAktiv();
    return true;
  }

  /** Schließt das geöffnete Meeting ab: Es liegt danach im Archiv, der Assistent ist leer. */
  schliesse(): Tag | null {
    const tag = this.#aktiv;
    if (!tag) return null;
    tag.abgeschlossen = true;
    tag.geschlossenAm = Date.now();
    schreibe(tag);
    this.#aktiv = null;
    this.#merkeAktiv();
    return tag;
  }

  /** Löscht ein Meeting samt Transkript, Protokoll und Chat. */
  loesche(id: string): boolean {
    if (!gueltigeId(id) || !fs.existsSync(datei(id))) return false;
    fs.rmSync(datei(id));
    if (this.#aktiv?.id === id) {
      this.#aktiv = null;
      this.#merkeAktiv();
    }
    return true;
  }

  /** Leert die Inhalte des geöffneten Meetings (Datenschutz-Anforderung). Name, Datum und Agenda bleiben. */
  leeren(): void {
    const t = this.#aktiv;
    if (!t) return;
    this.#aktiv = { ...t, protokoll: leeresProtokoll(t.protokoll.agenda.map((a) => a.titel)), chat: [], transkript: [], letzterZyklus: null, mockCursor: 0, mockFragenCursor: 0 };
    this.speichern();
  }
}

export const store = new Store();
