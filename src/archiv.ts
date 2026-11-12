import { agent } from "./einstellungen.ts";
import type { Tag } from "./store.ts";
import type { ChatNachricht, Protokoll } from "./types.ts";

// Aufbereitung eines Meetings für Ansicht und Download. Gespeichert wird in store.ts.

const uhr = (zeit: number) => new Date(zeit).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const datumLang = (datum: string) => new Date(`${datum}T12:00:00`).toLocaleDateString("de-DE", { dateStyle: "long" });
const kopf = (tag: Tag, was = "") => `# ${tag.name}${was ? ` – ${was}` : ""}\n${datumLang(tag.datum)}\n`;
const liste = (zeilen: string[]) => (zeilen.length ? zeilen.join("\n") : "- (keine)");
const titel = (p: Protokoll, id: string) => p.agenda.find((a) => a.id === id)?.titel ?? "Ohne Agendapunkt";
export const agentName = (n: ChatNachricht) => n.name ?? agent(n.von)?.name ?? "Agent";

/** Gruppiert Einträge nach Agendapunkt, in der Reihenfolge der Agenda; "Ohne Agendapunkt" zuletzt. */
export function nachAgendapunkt<T extends { agendapunkt: string }>(p: Protokoll, eintraege: T[]): { titel: string; eintraege: T[] }[] {
  const gruppen = p.agenda.map((a) => ({ titel: a.titel, eintraege: eintraege.filter((e) => e.agendapunkt === a.id) }));
  const ohne = eintraege.filter((e) => !p.agenda.some((a) => a.id === e.agendapunkt));
  return [...gruppen, { titel: "Ohne Agendapunkt", eintraege: ohne }].filter((g) => g.eintraege.length);
}

const todoZeile = (t: Protokoll["todos"][number]) => `- [${t.status === "erledigt" ? "x" : " "}] ${t.text} · Wer: ${t.owner} · Bis: ${t.frist}`;

/** To-do-Liste, gegliedert nach dem Agendapunkt, unter dem das To-do entstanden ist. */
export function todosText(p: Protokoll): string {
  const gruppen = nachAgendapunkt(p, p.todos);
  return gruppen.length ? gruppen.map((g) => `### ${g.titel}\n\n${g.eintraege.map(todoZeile).join("\n")}`).join("\n\n") : "- (keine)";
}

export function entscheidungenText(p: Protokoll): string {
  const gruppen = nachAgendapunkt(p, p.entscheidungen);
  return gruppen.length ? gruppen.map((g) => `### ${g.titel}\n\n${g.eintraege.map((e) => `- ${e.text}`).join("\n")}`).join("\n\n") : "- (keine)";
}

const fragenText = (p: Protokoll) => liste(p.offene_fragen.map((f) => `- ${f.text}${f.status === "beantwortet" ? " (beantwortet)" : ""}`));

export function chatText(tag: Tag): string {
  const zeilen = tag.chat.map((n) => (n.von === "frage" ? `\n**Frage (${uhr(n.zeit)}):** ${n.text}\n` : `- **${agentName(n)}:** ${n.text}`));
  return zeilen.length ? zeilen.join("\n").trim() : "- (keine)";
}

/** Transkript als Text, gegliedert nach dem Agendapunkt, der beim Sprechen ausgewählt war. */
export function transkriptText(tag: Tag): string {
  if (!tag.transkript.length) return "(leer)";
  const zeilen: string[] = [];
  let letzter: string | undefined = "\0";
  for (const t of tag.transkript) {
    if (t.agendapunkt !== letzter) {
      letzter = t.agendapunkt;
      zeilen.push(`\n### ${titel(tag.protokoll, t.agendapunkt ?? "")}\n`);
    }
    zeilen.push(`[${uhr(t.zeit)}] ${t.text}`);
  }
  return zeilen.join("\n").trim();
}

/** Zusammenfassung aus dem Protokollstand (ohne LLM, damit sie nichts dazuerfindet). */
export function zusammenfassung(p: Protokoll): string {
  return [
    "## Agenda",
    liste(p.agenda.map((a) => `- [${a.status === "erledigt" ? "x" : " "}] ${a.titel}${a.status === "läuft" ? " (läuft)" : ""}`)),
    "\n## To-dos\n",
    todosText(p),
    ...(p.vorschlaege.length ? ["\n## Vorschläge (nicht bestätigt)", liste(p.vorschlaege.map((v) => `- ${v.text}`))] : []),
    "\n## Entscheidungen\n",
    entscheidungenText(p),
    "\n## Offene Fragen",
    fragenText(p),
    "\n## Notizen",
    liste(p.notizen.map((n) => `- ${n.text}`)),
  ].join("\n");
}

/** Einzelne Downloads als Markdown. */
export const DOWNLOADS = {
  alles: (t: Tag) => [kopf(t), zusammenfassung(t.protokoll), "\n## Fragen und Antworten\n", chatText(t), "\n## Transkript\n", transkriptText(t), ""].join("\n"),
  transkript: (t: Tag) => `${kopf(t, "Transkript")}\n${transkriptText(t)}\n`,
  todos: (t: Tag) => `${kopf(t, "To-do-Liste")}\n${todosText(t.protokoll)}\n`,
  entscheidungen: (t: Tag) => `${kopf(t, "Entscheidungen und offene Fragen")}\n## Entscheidungen\n\n${entscheidungenText(t.protokoll)}\n\n## Offene Fragen\n\n${fragenText(t.protokoll)}\n`,
  fragen: (t: Tag) => `${kopf(t, "Fragen an die Spezial-Agenten")}\n${chatText(t)}\n`,
} satisfies Record<string, (t: Tag) => string>;

/** To-do-Liste als CSV für Excel (Semikolon, mit BOM, damit Umlaute stimmen). */
export function todosCsv(tag: Tag): string {
  const zelle = (w: string) => `"${w.replaceAll('"', '""')}"`;
  const zeilen = tag.protokoll.todos.map((t) => [titel(tag.protokoll, t.agendapunkt), t.text, t.owner, t.frist, t.status].map(zelle).join(";"));
  return `﻿${["Agendapunkt", "To-do", "Wer", "Bis", "Status"].map(zelle).join(";")}\r\n${zeilen.join("\r\n")}\r\n`;
}

/** Prompt + Protokoll + Transkript in einem Stück – zum Einfügen in Broki (Open WebUI). */
export function fuerBroki(tag: Tag, prompt: string): string {
  return [prompt, `\n=== PROTOKOLL: ${tag.name}, ${datumLang(tag.datum)} ===\n`, zusammenfassung(tag.protokoll), "\n=== TRANSKRIPT ===\n", transkriptText(tag)].join("\n");
}

/** Kurzinfo für Listen (Auswahl, Admin, Archiv). */
export function kurzinfo(tag: Tag, aktivId: string) {
  return {
    id: tag.id,
    name: tag.name,
    datum: tag.datum,
    aktiv: tag.id === aktivId,
    agenda: tag.protokoll.agenda.map((a) => a.titel),
    briefing: tag.briefing,
    begriffe: tag.begriffe,
    todos: tag.protokoll.todos.length,
    entscheidungen: tag.protokoll.entscheidungen.length,
    abschnitte: tag.transkript.length,
    fragen: tag.chat.filter((n) => n.von === "frage").length,
  };
}
