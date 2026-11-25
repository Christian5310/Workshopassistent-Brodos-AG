// Übersichtsfragen an die Spezial-Agenten: "Mache eine Stichpunktliste …", "Gib mir eine Übersicht …".
// Dann antwortet nur ein Agent, in kurzen Stichpunkten statt in zwei bis sechs Sätzen.

/** Höchstzahl der Stichpunkte einer Übersicht. */
export const UEBERSICHT_MAX_ZEILEN = 14;

const SCHLUESSELWOERTER = new RegExp(
  [
    // eindeutige Wörter: Stichpunkte, Übersicht, Zusammenfassung, Auswertung, Tabelle, Auflistung
    "(?<!\\p{L})(stichpunkt|stichwort|aufzähl|aufzaehl|auflist|übersicht|uebersicht|überblick|ueberblick|zusammenfass|auswertung|tabelle)\\p{L}*(?!\\p{L})",
    // "eine Liste", "als Liste", "in einer kurzen Liste" (nicht: "in der Liste", "aus der Ideenliste")
    "(?<!\\p{L})(eine|einer|als|kurze|kurzen|knappe|knappen)\\s+(\\p{L}+\\s+)?liste(?!\\p{L})",
    // Aufforderung: "Liste die Lösungen auf."
    "(?:^|[.!?]\\s+|bitte\\s+|mal\\s+)liste\\p{L}*\\s.{0,80}?\\bauf\\b",
  ].join("|"),
  "iu",
);

/** Verlangt die Frage eine Liste oder Übersicht? Nur dann, nicht schon beim Wort "Liste" ("in der Liste", "Ideenliste" zählen nicht). */
export function istUebersichtsfrage(frage: string): boolean {
  return SCHLUESSELWOERTER.test(frage);
}

/** Wer bei einer Übersichtsfrage an "alle" antwortet: ein einzelner Agent, bevorzugt der Vertriebsexperte. */
export function uebersichtsAdressat(an: string, agentIds: string[], uebersicht: boolean): string {
  if (an !== "alle" || !uebersicht) return an;
  return agentIds.includes("sales") ? "sales" : (agentIds[0] ?? an);
}

/** Format-Hinweis für das Sprachmodell: JSON-Rahmen, Länge und Schreibweise. */
export function formatHinweis(gefragt: { id: string; name: string }[], an: string, uebersicht = false): string {
  const rahmen =
    `Antworte ausschließlich als JSON: {"antworten": [{"rolle": "…", "text": "…"}]}. ` +
    `Erlaubte Werte für "rolle": ${gefragt.map((a) => `"${a.id}" (${a.name})`).join(", ")}. `;
  if (uebersicht) {
    return (
      rahmen +
      `Genau eine Antwort. Die Frage verlangt eine Übersicht: Schreibe im "text" eine kurze Einleitungszeile und danach höchstens ${UEBERSICHT_MAX_ZEILEN} Stichpunkte. ` +
      `Jede Zeile beginnt mit "• " und ist ein kurzer Satz oder Halbsatz, die Zeilen sind mit \\n getrennt. Gliedere nach den Bereichen oder Themen der Frage. ` +
      `Kein anderes Markdown (keine Sternchen, Überschriften oder Tabellen), kein Rollenname. Die Hinweise zu höchstens vier Sätzen und zu Aufzählungen gelten hier nicht.`
    );
  }
  return rahmen + (an === "alle" ? "Genau eine Antwort pro Rolle, je 1–3 Sätze." : "Genau eine Antwort, höchstens 6 Sätze.") + ` Im "text" kein Rollenname und kein Markdown.`;
}
