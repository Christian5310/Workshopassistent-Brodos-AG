/**
 * Repariert typische Fehler in JSON-Antworten von Sprachmodellen, die keinen garantierten JSON-Modus haben
 * (z. B. Claude über Broki/Open WebUI):
 * - unmaskierte Anführungszeichen im Text ("Kunde sagt "das dauert" beim …")
 * - überzählige Kommas vor } oder ] und fehlende Kommas zwischen zwei Einträgen (auch über Zeilenumbrüche)
 * - abgeschnittenes Ende (offene Zeichenkette, offene Listen und Objekte werden geschlossen)
 * Bewusst klein und ohne Abhängigkeit. Liefert reparierten Text; geparst wird beim Aufrufer.
 */
export function repariereJson(text: string): string {
  let aus = "";
  let inText = false;
  const offen: string[] = [];
  let nachWert = false; // zuletzt endete ein Wert (Text, Zahl, true/false/null, } oder ]) – dann fehlt vor einem neuen Wert ein Komma
  for (let i = 0; i < text.length; i++) {
    const z = text[i]!;
    if (inText) {
      if (z === "\\") {
        aus += z + (text[i + 1] ?? "");
        i++;
        continue;
      }
      if (z === "\n") {
        aus += "\\n";
        continue;
      }
      if (z === '"') {
        // Endet hier die Zeichenkette? Nur wenn danach (nach Leerzeichen) , : } ] oder das Textende kommt.
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j]!)) j++;
        if (j >= text.length || /[,:}\]]/.test(text[j]!) || (text[j] === '"' && /\n/.test(text.slice(i + 1, j)))) {
          inText = false;
          nachWert = true;
          aus += z;
        } else {
          aus += '\\"'; // Anführungszeichen mitten im Text
        }
        continue;
      }
      aus += z;
      continue;
    }
    if (/\s/.test(z)) {
      aus += z;
      continue;
    }
    const neuerWert = z === '"' || z === "{" || z === "[" || /[-0-9tfn]/.test(z);
    if (nachWert && neuerWert) aus += ","; // fehlendes Komma zwischen zwei Einträgen
    if (z === '"') inText = true;
    else if (z === "{" || z === "[") offen.push(z === "{" ? "}" : "]");
    else if (z === "}" || z === "]") offen.pop();
    aus += z;
    // Zahlen und true/false/null am Stück übernehmen
    if (/[-0-9tfn]/.test(z)) {
      while (i + 1 < text.length && /[-+.0-9eEa-z]/.test(text[i + 1]!)) aus += text[++i];
    }
    nachWert = z === "}" || z === "]" || /[-0-9tfn]/.test(z);
  }
  // Abgeschnitten: Zeichenkette schließen, unvollständiges letztes Element entfernen, Klammern schließen
  if (inText) aus += '"';
  aus = aus.replace(/,\s*$/, "").replace(/,\s*"[^"]*"\s*:?\s*$/, "").replace(/:\s*$/, ': null');
  while (offen.length) aus += offen.pop();
  // Überzählige Kommas vor schließenden Klammern
  return aus.replace(/,(\s*[}\]])/g, "$1");
}
