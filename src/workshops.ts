import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { config } from "./config.ts";

/**
 * Workshops: der größere Rahmen um ein Meeting. Ein Workshop bündelt Teilnehmer, eingereichtes Material
 * und genau ein Meeting (für Transkript, To-dos, Agenten). Gespeichert in data/workshops/<id>.json.
 * Namen und Material liegen nur in diesen Daten, nie im Code.
 */
export const MATERIAL_ARTEN = ["Interview", "Dokument", "Sonstiges"] as const;

const TeilnehmerSchema = z.object({ name: z.string().trim().min(1).max(60), rolle: z.string().trim().max(80) });
export const WorkshopEingabeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  agenda: z.array(z.string().trim().min(1).max(120)).max(30),
  teilnehmer: z.array(TeilnehmerSchema).max(40).default([]),
});
export const MaterialEingabeSchema = z.object({
  titel: z.string().trim().min(1).max(120),
  art: z.enum(MATERIAL_ARTEN).default("Dokument"),
  /** Von wem das Material stammt. Erscheint nur in der Material-Übersicht, nie bei den Agenten oder auf dem Beamer. */
  person: z.string().trim().max(60).default(""),
  text: z.string().trim().min(1).max(400_000),
});

export interface Material extends z.infer<typeof MaterialEingabeSchema> {
  id: string;
  zeit: number;
}
export interface Workshop {
  id: string;
  name: string;
  datum: string;
  erstellt: number;
  /** Das Meeting dieses Workshops (Agenda, Transkript, To-dos, Chat) */
  meetingId: string;
  teilnehmer: z.infer<typeof TeilnehmerSchema>[];
  material: Material[];
}

const ordner = path.join(path.dirname(config.pfade.daten), "workshops");
const gueltigeId = (id: string) => /^[\w-]+$/.test(id);
const datei = (id: string) => path.join(ordner, `${id}.json`);

function schreibe(w: Workshop): void {
  fs.mkdirSync(ordner, { recursive: true });
  const tmp = datei(w.id) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(w, null, 2));
  fs.renameSync(tmp, datei(w.id));
}

export function hole(id: string): Workshop | null {
  if (!gueltigeId(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(datei(id), "utf8")) as Workshop;
  } catch {
    return null;
  }
}

export function liste(): Workshop[] {
  if (!fs.existsSync(ordner)) return [];
  return fs
    .readdirSync(ordner)
    .filter((f) => f.endsWith(".json"))
    .map((f) => hole(f.slice(0, -5)))
    .filter((w): w is Workshop => w !== null)
    .sort((a, b) => b.datum.localeCompare(a.datum) || b.erstellt - a.erstellt);
}

export function erstelle(name: string, datum: string, meetingId: string, teilnehmer: Workshop["teilnehmer"]): Workshop {
  const w: Workshop = { id: `ws-${datum}-${randomUUID().slice(0, 6)}`, name, datum, erstellt: Date.now(), meetingId, teilnehmer, material: [] };
  schreibe(w);
  return w;
}

export function aendere(id: string, aenderung: (w: Workshop) => void): Workshop | null {
  const w = hole(id);
  if (!w) return null;
  aenderung(w);
  schreibe(w);
  return w;
}

export function loesche(id: string): boolean {
  if (!gueltigeId(id) || !fs.existsSync(datei(id))) return false;
  fs.rmSync(datei(id));
  return true;
}

export const neuesMaterial = (eingabe: z.infer<typeof MaterialEingabeSchema>): Material => ({ ...eingabe, id: randomUUID().slice(0, 8), zeit: Date.now() });

/** Kurzinfo ohne die Texte des Materials (für Listen). */
export const kurz = (w: Workshop) => ({
  id: w.id,
  name: w.name,
  datum: w.datum,
  meetingId: w.meetingId,
  teilnehmer: w.teilnehmer,
  material: w.material.map(({ text, ...rest }) => ({ ...rest, zeichen: text.length })),
});
