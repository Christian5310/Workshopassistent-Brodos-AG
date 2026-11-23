// Reine Hilfsfunktionen für scripts/agententest.ts (ohne Netzwerk, ohne Dateizugriff) – dadurch testbar.

export type Frage = { id: string; block: string; an: "A" | "V" | "K" | "B"; typ: string; frage: string; pruefpunkt: string };
export type AgentDef = { id: string; kuerzel: "V" | "K" | "B"; name: string; beschreibung: string; wissen: string };

/** Liest die Fragetabellen aus testfragen.md: Zeilen wie `| A1-01 | A | F | Frage | Prüfpunkt |`. */
export function liesFragen(md: string): Frage[] {
  const fragen: Frage[] = [];
  for (const zeile of md.split(/\r?\n/)) {
    const m = zeile.match(/^\|\s*(A[1-5]-\d{2})\s*\|\s*([AVKB])\s*\|\s*([A-Z])\s*\|(.*)\|(.*)\|\s*$/);
    if (!m) continue;
    fragen.push({ id: m[1]!, block: m[1]!.slice(0, 2), an: m[2] as Frage["an"], typ: m[3]!, frage: m[4]!.trim(), pruefpunkt: m[5]!.trim() });
  }
  return fragen;
}

/** Der Ausschnitt, den eine T-Frage meint: "(Ausschnitt A2b)" am Ende, sonst der Ausschnitt ihres Blocks. */
export const ausschnittVon = (f: { frage: string; block: string }): string => f.frage.match(/\(Ausschnitt (A[1-5]b?)\)\s*$/)?.[1] ?? f.block;

/** Gesprächsausschnitte: `- **Ausschnitt A2:** "Text"` → { A2: "Text" }. */
export function liesAusschnitte(md: string): Record<string, string> {
  const aus: Record<string, string> = {};
  for (const m of md.matchAll(/^- \*\*Ausschnitt (A[1-5]b?):\*\*\s*"(.*)"\s*$/gm)) aus[m[1]!] = m[2]!;
  return aus;
}

/** Agenda für den Test: Zeilen `- A1: Titel` (A1 bis A5) in testfragen.md. Leer, wenn keine Agenda dort steht. */
export function liesAgenda(md: string): string[] {
  const titel: Record<string, string> = {};
  for (const m of md.matchAll(/^- (A[1-5]): (.+?)\s*$/gm)) titel[m[1]!] = m[2]!;
  return ["A1", "A2", "A3", "A4", "A5"].map((k) => titel[k]).filter((t): t is string => !!t);
}

/** Die Texte zwischen den Zeilen `-----` in prompts.md: Gesamt-Prompt, dann die drei Rollen (Vertrieb, KI, BPM). */
export function liesPromptBloecke(md: string): string[] {
  return [...md.matchAll(/\r?\n-----\r?\n([\s\S]*?)\r?\n-----\r?\n/g)].map((m) => m[1]!.trim());
}

/** Dasselbe Format wie expertenrunde() in src/anbieter/llm.ts. */
export function formatHinweis(gefragt: { id: string; name: string }[], an: string): string {
  return (
    `Antworte ausschließlich als JSON: {"antworten": [{"rolle": "…", "text": "…"}]}. ` +
    `Erlaubte Werte für "rolle": ${gefragt.map((a) => `"${a.id}" (${a.name})`).join(", ")}. ` +
    (an === "alle" ? "Genau eine Antwort pro Rolle, je 1–3 Sätze." : "Genau eine Antwort, höchstens 6 Sätze.") +
    ` Im "text" kein Rollenname und kein Markdown.`
  );
}

/** Setzt die Platzhalter wie promptAgentenFertig() in src/einstellungen.ts ein (Wissen nur bei den gefragten Agenten). */
export function baueSystemPrompt(o: { gesamt: string; briefing: string; agenda: string[]; laeuft: string; agenten: AgentDef[]; an: string }): string {
  const zeile = (a: AgentDef) => `- ${a.name}: ${a.beschreibung}` + ((o.an === "alle" || o.an === a.id) && a.wissen.trim() ? `\n\n<wissen agent="${a.name}">\n${a.wissen.trim()}\n</wissen>\n` : "");
  const stand = JSON.stringify({ agenda: o.agenda.map((t, i) => ({ id: `A${i + 1}`, titel: t, status: `A${i + 1}` === o.laeuft ? "läuft" : "offen" })), todos: [], vorschlaege: [], entscheidungen: [], offene_fragen: [], notizen: [] });
  const ersetzungen: Record<string, string> = {
    "[BRODOS-BRIEFING]": o.briefing.trim() || "(kein Hintergrundwissen hinterlegt)",
    "[AGENDA]": o.agenda.map((t, i) => `${i + 1}. ${t}${`A${i + 1}` === o.laeuft ? " (läuft gerade)" : ""}`).join("\n"),
    "[STAND]": stand,
    "[AGENTEN]": o.agenten.map(zeile).join("\n"),
  };
  return Object.entries(ersetzungen).reduce((text, [platzhalter, wert]) => text.replaceAll(platzhalter, wert), o.gesamt);
}

export const frageNachricht = (frage: string, an: string, anName: string, ausschnitt?: string) =>
  `${ausschnitt ? `Im Raum gesagt, letzte 60 Minuten (Transkript, ohne Sprecher):\n${ausschnitt}\n\n` : ""}Frage${an === "alle" ? "" : ` an ${anName}`}: ${frage}`;

/**
 * Wörter, die als Name gelten: aus den Quelldateien abgeleitet.
 * - Tabellen mit Leitung: Spalte 2, Einträge wie "Vorname Nachname (Rolle)", getrennt durch Komma oder "und".
 * - Personentabelle (Kopfzeile "Person"): Spalte 1, auch einzelne Vornamen.
 * Übergeben werden nur Dateien, in denen Personen stehen (Abteilungsverzeichnis, Kontext), sonst gäbe es falsche Treffer.
 */
export function sammleNamen(quellen: string[]): string[] {
  const namen = new Set<string>();
  const muster = /^[A-ZÄÖÜ][\p{L}-]+( [A-ZÄÖÜ][\p{L}-]+){1,2}$/u;
  for (const text of quellen) {
    let personen = false;
    for (const zeile of text.split(/\r?\n/)) {
      if (!zeile.startsWith("|")) { personen = false; continue; }
      const zellen = zeile.split("|").map((z) => z.trim());
      if (zellen[1] === "Person") personen = true;
      if (personen) {
        const erste = (zellen[1] ?? "").replace(/\(.*?\)/g, "").trim();
        if (/^[A-ZÄÖÜ][\p{L}-]+( [A-ZÄÖÜ][\p{L}-]+)?$/u.test(erste) && erste !== "Person") {
          namen.add(erste);
          for (const wort of erste.split(" ")) if (wort.length >= 3) namen.add(wort);
        }
        continue;
      }
      for (const teil of (zellen[2] ?? "").split(/,|\bund\b|;/)) {
        const t = teil.replace(/\(.*?\)/g, "").replace(/`.*?`/g, "").trim();
        if (!muster.test(t)) continue;
        namen.add(t);
        for (const wort of t.split(" ")) if (wort.length >= 5) namen.add(wort);
      }
    }
  }
  return [...namen];
}

export type Verstoss = { regel: "name" | "laenge" | "markdown" | "zahl" | "format"; text: string };

const KUERZEL = /\b(z\. ?B|d\. ?h|u\. ?a|u\. ?U|bzw|ca|evtl|inkl|usw|vgl|Nr|ggf|etc|Abs|Art|Std|Min|Mio|Mrd|s\. ?o|S|M|L)\./g;

/** Zählt Sätze grob: Punkt, Ausrufe- oder Fragezeichen vor Leerzeichen oder Textende. Abkürzungen und Zahlen wie 1.500 zählen nicht. */
export function zaehleSaetze(text: string): number {
  const rein = text.replace(KUERZEL, (_m, k: string) => k.replace(/[. ]/g, "")).replace(/(\d)\.(\d)/g, "$1$2").replace(/\.\.\./g, "…").replace(/`[^`]*`/g, "x");
  return (rein.match(/[.!?…]+(?=\s|$)/g) ?? []).length || (rein.trim() ? 1 : 0);
}

/** Automatische Prüfung einer Antwort. `kontext` ist alles, was das Modell lesen durfte (zum Erkennen erfundener Zahlen). */
export function pruefeAntwort(o: { text: string; rolle: string; an: string; namen: string[]; kontext: string; erlaubteNamen?: string }): Verstoss[] {
  const v: Verstoss[] = [];
  const t = o.text;
  for (const n of o.namen) {
    if (o.erlaubteNamen?.includes(n)) continue; // Namen aus der Organisationsübersicht im Wissen dürfen genannt werden
    if (new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "u").test(t)) v.push({ regel: "name", text: n });
  }
  const limit = o.an === "alle" ? 3 : 6;
  const saetze = zaehleSaetze(t);
  if (saetze > limit) v.push({ regel: "laenge", text: `${saetze} Sätze (erlaubt ${limit})` });
  if (/^\s*([-*•]|\d+[.)])\s/m.test(t) || /\*\*|^#{1,6}\s|```/m.test(t)) v.push({ regel: "markdown", text: "Aufzählung oder Markdown" });
  if (/^\s*(Vertriebsexperte|KI- und Automatisierungsexperte|BPM-Experte)\s*[:\-–]/i.test(t)) v.push({ regel: "markdown", text: "Rollenname im Text" });
  for (const m of t.matchAll(/(\d[\d.,]*)\s?(%|Prozent|€|Euro|EUR)/g)) {
    // Die Zahl muss mit derselben Einheit im Wissen, Briefing oder in der Frage stehen (nicht nur irgendwo als Ziffernfolge)
    const zahl = m[1]!.replace(/[.,]$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const einheit = /%|Prozent/.test(m[2]!) ? "(%|Prozent)" : "(€|Euro|EUR)";
    if (!new RegExp(`${zahl}\\s?${einheit}`).test(o.kontext)) v.push({ regel: "zahl", text: `${m[0]} steht nicht im Wissen` });
  }
  return v;
}

/** Liest JSON aus der Antwort, auch aus einem Code-Block oder mit Text davor. */
export function leseJson(text: string): unknown {
  const roh = text.trim();
  try {
    return JSON.parse(roh);
  } catch {
    const block = roh.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1]?.trim();
    const von = roh.indexOf("{");
    const kandidat = block ?? (von >= 0 ? roh.slice(von) : roh);
    return JSON.parse(kandidat.slice(0, kandidat.lastIndexOf("}") + 1));
  }
}

export type Antwort = { rolle: string; text: string };

/** Prüft die Struktur der Modellantwort: {"antworten":[{"rolle","text"}]}. */
export function leseAntworten(json: unknown): Antwort[] {
  const liste = (json as { antworten?: unknown })?.antworten;
  if (!Array.isArray(liste)) throw new Error('Antwort ohne "antworten"-Liste');
  return liste.flatMap((a) => (a && typeof a.rolle === "string" && typeof a.text === "string" && a.text.trim() ? [{ rolle: a.rolle, text: a.text.trim() }] : []));
}
