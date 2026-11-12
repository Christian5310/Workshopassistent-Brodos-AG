import { einstellungen } from "./einstellungen.ts";
import type { Tag } from "./store.ts";
import type { Protokoll } from "./types.ts";

// Aufbereitung eines Tages für Ansicht und Download. Gespeichert wird in store.ts.

const uhr = (zeit: number) => new Date(zeit).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const datumLang = (datum: string) => new Date(`${datum}T12:00:00`).toLocaleDateString("de-DE", { dateStyle: "long" });

/** Zusammenfassung aus dem Protokollstand (ohne LLM, damit sie nichts dazuerfindet). */
export function zusammenfassung(p: Protokoll): string {
  const liste = (zeilen: string[]) => (zeilen.length ? zeilen.join("\n") : "- (keine)");
  const punkt = (id: string) => p.agenda.find((a) => a.id === id)?.titel;
  const mitPunkt = (id: string) => (punkt(id) ? ` · Agendapunkt: ${punkt(id)}` : "");
  return [
    "## Agenda",
    liste(p.agenda.map((a) => `- [${a.status === "erledigt" ? "x" : " "}] ${a.titel}${a.status === "läuft" ? " (läuft)" : ""}`)),
    "\n## To-dos",
    liste(p.todos.map((t) => `- [${t.status === "erledigt" ? "x" : " "}] ${t.text} · Wer: ${t.owner} · Bis: ${t.frist}${mitPunkt(t.agendapunkt)}`)),
    ...(p.vorschlaege.length ? ["\n## Vorschläge (nicht bestätigt)", liste(p.vorschlaege.map((v) => `- ${v.text}`))] : []),
    "\n## Entscheidungen",
    liste(p.entscheidungen.map((e) => `- ${e.text}${mitPunkt(e.agendapunkt)}`)),
    "\n## Offene Fragen",
    liste(p.offene_fragen.map((f) => `- ${f.text}${f.status === "beantwortet" ? " (beantwortet)" : ""}`)),
    "\n## Notizen",
    liste(p.notizen.map((n) => `- ${n.text}`)),
  ].join("\n");
}

/** Transkript als Text, gegliedert nach dem Agendapunkt, der beim Sprechen ausgewählt war. */
export function transkriptText(tag: Tag): string {
  if (!tag.transkript.length) return "(leer)";
  const zeilen: string[] = [];
  let letzter: string | undefined = "\0";
  for (const t of tag.transkript) {
    if (t.agendapunkt !== letzter) {
      letzter = t.agendapunkt;
      zeilen.push(`\n### ${tag.protokoll.agenda.find((a) => a.id === t.agendapunkt)?.titel ?? "Ohne Agendapunkt"}\n`);
    }
    zeilen.push(`[${uhr(t.zeit)}] ${t.text}`);
  }
  return zeilen.join("\n").trim();
}

const kopf = (tag: Tag) => `# ${tag.name}\n${datumLang(tag.datum)}\n`;

/** Nur das Transkript – zum Herunterladen. */
export function transkriptMarkdown(tag: Tag): string {
  return `${kopf(tag)}\n## Transkript\n\n${transkriptText(tag)}\n`;
}

/** Kompletter Tag als Markdown-Dokument. */
export function alsMarkdown(tag: Tag): string {
  const chat = tag.chat.map((n) =>
    n.von === "frage" ? `\n**Frage (${uhr(n.zeit)}):** ${n.text}\n` : `- **${einstellungen.agenten[n.von].name}:** ${n.text}`,
  );
  return [kopf(tag), zusammenfassung(tag.protokoll), "\n## Fragen und Antworten", chat.length ? chat.join("\n") : "- (keine)", "\n## Transkript\n", transkriptText(tag), ""].join("\n");
}

/** Prompt + Protokoll + Transkript in einem Stück – zum Einfügen in Broki (Open WebUI). */
export function fuerBroki(tag: Tag): string {
  return [einstellungen.promptZusammenfassung, `\n=== PROTOKOLL: ${tag.name}, ${datumLang(tag.datum)} ===\n`, zusammenfassung(tag.protokoll), "\n=== TRANSKRIPT ===\n", transkriptText(tag)].join("\n");
}

/** Kurzinfo für Listen (Auswahl, Admin, Archiv). */
export function kurzinfo(tag: Tag, aktivId: string) {
  return {
    id: tag.id,
    name: tag.name,
    datum: tag.datum,
    aktiv: tag.id === aktivId,
    agenda: tag.protokoll.agenda.map((a) => a.titel),
    todos: tag.protokoll.todos.length,
    abschnitte: tag.transkript.length,
    fragen: tag.chat.filter((n) => n.von === "frage").length,
  };
}
