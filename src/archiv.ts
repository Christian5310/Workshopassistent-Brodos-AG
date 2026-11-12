import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";
import { einstellungen } from "./einstellungen.ts";
import { store } from "./store.ts";
import type { ChatNachricht, Protokoll, TranskriptAbschnitt } from "./types.ts";

/** Ein archivierter Workshop-Stand: Transkript, Zusammenfassung, Protokoll sowie Fragen und Antworten. */
export interface ArchivEintrag {
  id: string;
  titel: string;
  zeit: number;
  zusammenfassung: string; // Markdown
  protokoll: Protokoll;
  transkript: TranskriptAbschnitt[];
  chat: ChatNachricht[];
}

const ordner = path.join(path.dirname(config.pfade.daten), "archiv");
const gueltigeId = (id: string) => /^[\w-]+$/.test(id); // verhindert Pfad-Tricks wie "../"
const datei = (id: string) => path.join(ordner, `${id}.json`);
const uhr = (zeit: number) => new Date(zeit).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

/** Zusammenfassung aus dem Protokollstand (ohne LLM, damit sie nichts dazuerfindet). */
export function zusammenfassung(p: Protokoll): string {
  const liste = (zeilen: string[]) => (zeilen.length ? zeilen.join("\n") : "- (keine)");
  return [
    "## Agenda",
    liste(p.agenda.map((a) => `- [${a.status === "erledigt" ? "x" : " "}] ${a.titel}${a.status === "läuft" ? " (läuft)" : ""}`)),
    "\n## To-dos",
    liste(p.todos.map((t) => `- [${t.status === "erledigt" ? "x" : " "}] ${t.text} · Wer: ${t.owner} · Bis: ${t.frist}`)),
    ...(p.vorschlaege.length ? ["\n## Vorschläge (nicht bestätigt)", liste(p.vorschlaege.map((v) => `- ${v.text}`))] : []),
    "\n## Entscheidungen",
    liste(p.entscheidungen.map((e) => `- ${e.text}`)),
    "\n## Offene Fragen",
    liste(p.offene_fragen.map((f) => `- ${f.text}${f.status === "beantwortet" ? " (beantwortet)" : ""}`)),
    "\n## Notizen",
    liste(p.notizen.map((n) => `- ${n.text}`)),
  ].join("\n");
}

/** Kompletter Eintrag als Markdown-Dokument zum Herunterladen. */
export function alsMarkdown(e: ArchivEintrag): string {
  const chat = e.chat.map((n) =>
    n.von === "frage" ? `\n**Frage (${uhr(n.zeit)}):** ${n.text}\n` : `- **${einstellungen.agenten[n.von].name}:** ${n.text}`,
  );
  return [
    `# ${e.titel}`,
    `Archiviert am ${new Date(e.zeit).toLocaleString("de-DE")}\n`,
    e.zusammenfassung,
    "\n## Fragen und Antworten",
    chat.length ? chat.join("\n") : "- (keine)",
    "\n## Transkript",
    e.transkript.length ? e.transkript.map((t) => `- ${uhr(t.zeit)} ${t.text}`).join("\n") : "- (leer)",
    "",
  ].join("\n");
}

/** Prompt + Protokoll + Transkript in einem Stück – zum Einfügen in Broki (Open WebUI). */
export function fuerBroki(e: ArchivEintrag): string {
  return [
    einstellungen.promptZusammenfassung,
    `\n=== PROTOKOLL: ${e.titel} ===\n`,
    e.zusammenfassung,
    "\n=== TRANSKRIPT ===\n",
    e.transkript.map((t) => `[${uhr(t.zeit)}] ${t.text}`).join("\n") || "(leer)",
  ].join("\n");
}

export function archiviere(titel: string): ArchivEintrag {
  const zeit = Date.now();
  const d = store.daten;
  const eintrag: ArchivEintrag = {
    id: `${new Date(zeit).toISOString().replace(/[:.]/g, "-")}`,
    titel: titel.trim().slice(0, 120) || `Workshop ${new Date(zeit).toLocaleString("de-DE")}`,
    zeit,
    zusammenfassung: zusammenfassung(d.protokoll),
    protokoll: structuredClone(d.protokoll),
    transkript: structuredClone(d.transkript),
    chat: structuredClone(d.chat),
  };
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(datei(eintrag.id), JSON.stringify(eintrag, null, 2));
  return eintrag;
}

export function lies(id: string): ArchivEintrag | null {
  if (!gueltigeId(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(datei(id), "utf8")) as ArchivEintrag;
  } catch {
    return null;
  }
}

/** Übersicht, neueste zuerst – ohne die großen Inhalte. */
export function uebersicht() {
  if (!fs.existsSync(ordner)) return [];
  return fs
    .readdirSync(ordner)
    .filter((f) => f.endsWith(".json"))
    .map((f) => lies(f.slice(0, -5)))
    .filter((e): e is ArchivEintrag => e !== null)
    .sort((a, b) => b.zeit - a.zeit)
    .map((e) => ({
      id: e.id,
      titel: e.titel,
      zeit: e.zeit,
      todos: e.protokoll.todos.length,
      abschnitte: e.transkript.length,
      fragen: e.chat.filter((n) => n.von === "frage").length,
    }));
}

export function loesche(id: string): boolean {
  if (!gueltigeId(id) || !fs.existsSync(datei(id))) return false;
  fs.rmSync(datei(id));
  return true;
}

export function loescheAlles(): void {
  fs.rmSync(ordner, { recursive: true, force: true });
}
