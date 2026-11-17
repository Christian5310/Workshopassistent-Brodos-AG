import type { Protokoll } from "./types.ts";

/**
 * Arbeitsstand für das Sprachmodell: nur der laufende Agendapunkt vollständig,
 * von den übrigen Punkten nur die offenen To-dos als Kurzliste (für Befehle wie „lösche T12").
 * Hält die Anfrage klein, auch wenn das Protokoll über den Tag wächst.
 */
export function arbeitsstand(p: Protokoll, punkt: string) {
  const hier = <T extends { agendapunkt?: string }>(l: T[]) => l.filter((x) => (x.agendapunkt ?? "") === punkt);
  return {
    agenda: p.agenda,
    todos: hier(p.todos).map(({ gruppe: _g, ...t }) => t),
    vorschlaege: hier(p.vorschlaege),
    entscheidungen: hier(p.entscheidungen),
    offene_fragen: p.offene_fragen.filter((f) => f.status === "offen" || f.agendapunkt === punkt),
    notizen: hier(p.notizen).slice(-10),
    uebrige_offene_todos: p.todos.filter((t) => t.agendapunkt !== punkt && t.status === "offen").map((t) => ({ id: t.id, text: t.text })),
  };
}

const istObjekt = (w: unknown): w is Record<string, unknown> => typeof w === "object" && w !== null && !Array.isArray(w);
const liste = (w: unknown): unknown[] => (Array.isArray(w) ? w : []);
const ids = (w: unknown) => new Set(liste(w).map((x) => String(istObjekt(x) ? x.id : x)));

/**
 * Wandelt eine Änderungs-Antwort ({"neu": {...}, "erledigt": [...], "beantwortet": [...]}) in einen
 * vollständigen Stand um, damit die bestehende Absicherung (Duplikate, IDs, Obergrenze) unverändert greift.
 * Antworten im alten Format (ganzer STAND, z. B. Mock) werden unverändert durchgereicht.
 */
export function wendeAenderungenAn(alt: Protokoll, antwort: unknown): unknown {
  if (!istObjekt(antwort) || !("neu" in antwort || "erledigt" in antwort || "beantwortet" in antwort)) return antwort;
  const neu = istObjekt(antwort.neu) ? antwort.neu : {};
  const erledigt = ids(antwort.erledigt);
  const beantwortet = ids(antwort.beantwortet);
  const ohneId = (w: unknown) => liste(w).filter(istObjekt).map((x) => ({ ...x, id: "" })); // neue IDs vergibt die Absicherung
  return {
    ...antwort,
    agenda: alt.agenda,
    todos: [...alt.todos.map((t) => (erledigt.has(t.id) ? { ...t, status: "erledigt" } : t)), ...ohneId(neu.todos)],
    vorschlaege: [...alt.vorschlaege, ...ohneId(neu.vorschlaege)],
    entscheidungen: [...alt.entscheidungen, ...ohneId(neu.entscheidungen)],
    offene_fragen: [...alt.offene_fragen.map((f) => (beantwortet.has(f.id) ? { ...f, status: "beantwortet" } : f)), ...ohneId(neu.offene_fragen)],
    notizen: [...alt.notizen, ...liste(neu.notizen).flatMap((n) => (typeof n === "string" ? [{ text: n }] : istObjekt(n) ? [n] : []))],
  };
}
