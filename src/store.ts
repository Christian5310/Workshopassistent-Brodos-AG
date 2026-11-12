import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";
import { einstellungen } from "./einstellungen.ts";
import { ProtokollSchema, type ChatNachricht, type Protokoll, type TranskriptAbschnitt } from "./types.ts";

interface Daten {
  protokoll: Protokoll;
  chat: ChatNachricht[];
  transkript: TranskriptAbschnitt[];
  letzterZyklus: number | null;
  /** Position im Mock-Skript bzw. in den Mock-Fragen (nur Mock-Modus) */
  mockCursor: number;
  mockFragenCursor: number;
}

function leeresProtokoll(): Protokoll {
  return {
    agenda: einstellungen.agenda.map((titel, i) => ({ id: `A${i + 1}`, titel, status: "offen" as const })),
    todos: [],
    vorschlaege: [],
    entscheidungen: [],
    offene_fragen: [],
    notizen: [],
  };
}

function leereDaten(): Daten {
  return { protokoll: leeresProtokoll(), chat: [], transkript: [], letzterZyklus: null, mockCursor: 0, mockFragenCursor: 0 };
}

function laden(): Daten {
  try {
    const roh = JSON.parse(fs.readFileSync(config.pfade.daten, "utf8")) as Daten;
    return { ...leereDaten(), ...roh, protokoll: ProtokollSchema.parse(roh.protokoll) };
  } catch {
    return leereDaten();
  }
}

/** Speicher: eine JSON-Datei, damit Neuladen der Seite und Neustart des Servers keinen Stand verlieren. */
class Store {
  daten: Daten = laden();

  speichern(): void {
    fs.mkdirSync(path.dirname(config.pfade.daten), { recursive: true });
    const tmp = config.pfade.daten + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.daten, null, 2));
    fs.renameSync(tmp, config.pfade.daten); // atomar: nie eine halb geschriebene Datei
  }

  /** Löscht Transkript, Protokoll und Chat (Datenschutz-Anforderung) und lädt die Agenda neu. */
  loeschen(): void {
    this.daten = leereDaten();
    fs.rmSync(config.pfade.daten, { force: true });
  }
}

export const store = new Store();
