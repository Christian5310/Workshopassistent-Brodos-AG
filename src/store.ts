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

function neuerTag(name: string, datum: string, agenda: string[]): Tag {
  const kurz = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30) || "tag";
  return {
    id: `${datum}-${kurz}-${randomUUID().slice(0, 4)}`,
    name,
    datum,
    erstellt: Date.now(),
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
    return { ...roh, protokoll: ProtokollSchema.parse(roh.protokoll) };
  } catch {
    return null;
  }
}

const standardAgenda = () => (JSON.parse(fs.readFileSync(config.pfade.agenda, "utf8")) as { titel: string }[]).map((a) => a.titel);

/** Einmalig: Daten aus älteren Versionen (state.json, Archiv-Schnappschüsse) als Tage übernehmen. */
function migriere(): void {
  if (fs.existsSync(ordner)) return;
  fs.mkdirSync(ordner, { recursive: true });
  try {
    const alt = JSON.parse(fs.readFileSync(config.pfade.daten, "utf8"));
    const tag = neuerTag("Workshop", heute(), []);
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
        const tag = neuerTag(String(e.titel), new Date(e.zeit).toLocaleDateString("sv-SE"), []);
        schreibe({ ...tag, erstellt: e.zeit, protokoll: ProtokollSchema.parse(e.protokoll), transkript: e.transkript ?? [], chat: e.chat ?? [] });
      } catch {
        // unlesbarer Eintrag: überspringen
      }
    }
    fs.rmSync(altArchiv, { recursive: true, force: true });
  }
}

class Store {
  /** Der aktive Tag: hier laufen Aufnahme, Protokoll und Chat. */
  daten: Tag;

  constructor() {
    migriere();
    let aktivId = "";
    try {
      aktivId = JSON.parse(fs.readFileSync(aktivDatei, "utf8")).id;
    } catch {
      // noch kein aktiver Tag gemerkt
    }
    this.daten = lies(aktivId) ?? this.liste()[0] ?? this.erstelle("Workshop", heute(), standardAgenda());
    this.#merkeAktiv();
  }

  #merkeAktiv(): void {
    fs.writeFileSync(aktivDatei, JSON.stringify({ id: this.daten.id }));
  }

  speichern(): void {
    schreibe(this.daten);
  }

  /** Alle Tage, neuester zuerst. Der aktive kommt aus dem Arbeitsspeicher. */
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
    return this.daten?.id === id ? this.daten : lies(id);
  }

  erstelle(name: string, datum: string, agenda: string[]): Tag {
    const tag = neuerTag(name, datum, agenda);
    schreibe(tag);
    return tag;
  }

  aendere(id: string, name: string, datum: string, agenda: string[]): Tag | null {
    const tag = this.hole(id);
    if (!tag) return null;
    tag.name = name;
    tag.datum = datum;
    agendaAnwenden(tag.protokoll, agenda);
    schreibe(tag);
    return tag;
  }

  wechsle(id: string): boolean {
    const tag = lies(id);
    if (!tag) return false;
    this.speichern();
    this.daten = tag;
    this.#merkeAktiv();
    return true;
  }

  /** Löscht einen Tag samt Transkript, Protokoll und Chat. Es bleibt immer mindestens ein Tag bestehen. */
  loesche(id: string): boolean {
    if (!gueltigeId(id) || !fs.existsSync(datei(id))) return false;
    fs.rmSync(datei(id));
    if (this.daten.id === id) {
      this.daten = this.liste()[0] ?? this.erstelle("Workshop", heute(), standardAgenda());
      this.#merkeAktiv();
    }
    return true;
  }

  /** Leert die Inhalte des aktiven Tages (Datenschutz-Anforderung). Name, Datum und Agenda bleiben. */
  leeren(): void {
    const t = this.daten;
    this.daten = { ...t, protokoll: leeresProtokoll(t.protokoll.agenda.map((a) => a.titel)), chat: [], transkript: [], letzterZyklus: null, mockCursor: 0, mockFragenCursor: 0 };
    this.speichern();
  }
}

export const store = new Store();
