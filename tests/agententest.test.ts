// Ausführen: npm.cmd test
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baueSystemPrompt, formatHinweis, leseAntworten, leseJson, liesAusschnitte, liesFragen, liesPromptBloecke, pruefeAntwort, sammleNamen, zaehleSaetze,
} from "../scripts/agententest-kern.ts";

test("Fragen und Ausschnitte aus der Testfragen-Datei lesen", () => {
  const md = [
    '- **Ausschnitt A2:** "Erster Satz. Zweiter Satz."',
    "| ID | an | Typ | Frage | Prüfpunkt |",
    "|---|---|---|---|---|",
    "| A2-01 | B | F | Wie sieht der Ist-Prozess aus? | Neun Schritte |",
    "| A2-20 | A | T | Was fällt euch auf? (Ausschnitt A2) | Vier Wege |",
  ].join("\n");
  const fragen = liesFragen(md);
  assert.equal(fragen.length, 2);
  assert.deepEqual(fragen[0], { id: "A2-01", block: "A2", an: "B", typ: "F", frage: "Wie sieht der Ist-Prozess aus?", pruefpunkt: "Neun Schritte" });
  assert.equal(liesAusschnitte(md).A2, "Erster Satz. Zweiter Satz.");
});

test("Prompt-Blöcke zwischen den Trennzeilen", () => {
  const md = "Kopf\n\n-----\nEins\n-----\n\ntext\n\n-----\nZwei\nzeile\n-----\n";
  assert.deepEqual(liesPromptBloecke(md), ["Eins", "Zwei\nzeile"]);
});

test("Systemprompt: Platzhalter ersetzt, Wissen nur bei den gefragten Agenten", () => {
  const agenten = [
    { id: "sales", kuerzel: "V" as const, name: "Vertrieb", beschreibung: "Rolle V", wissen: "WISSEN-V" },
    { id: "bpm", kuerzel: "B" as const, name: "BPM", beschreibung: "Rolle B", wissen: "WISSEN-B" },
  ];
  const basis = { gesamt: "B:[BRODOS-BRIEFING]|A:[AGENDA]|S:[STAND]|X:[AGENTEN]", briefing: "BRIEF", agenda: ["Eins", "Zwei"], laeuft: "A2", agenten };
  const einzeln = baueSystemPrompt({ ...basis, an: "bpm" });
  assert.match(einzeln, /B:BRIEF/);
  assert.match(einzeln, /2\. Zwei \(läuft gerade\)/);
  assert.match(einzeln, /WISSEN-B/);
  assert.doesNotMatch(einzeln, /WISSEN-V/);
  assert.match(einzeln, /Rolle V/);
  const alle = baueSystemPrompt({ ...basis, an: "alle" });
  assert.match(alle, /WISSEN-V/);
  assert.match(alle, /WISSEN-B/);
  assert.doesNotMatch(einzeln, /\[AGENTEN\]|\[STAND\]/);
});

test("Format-Hinweis wie in der App", () => {
  assert.match(formatHinweis([{ id: "a", name: "A" }, { id: "b", name: "B" }], "alle"), /je 1–3 Sätze/);
  assert.match(formatHinweis([{ id: "a", name: "A" }], "a"), /höchstens 6 Sätze/);
});

test("Sätze zählen: Abkürzungen und Zahlen zählen nicht", () => {
  assert.equal(zaehleSaetze("Das ist z. B. ein Test. Und noch einer, ca. 1.500 Stück!"), 2);
  assert.equal(zaehleSaetze("Eine Frage? Ja. Nein."), 3);
  assert.equal(zaehleSaetze("Ohne Satzzeichen"), 1);
});

test("Namen aus Tabellenzellen sammeln", () => {
  const namen = sammleNamen([
    "| Abteilung | Leitung | Was |\n|---|---|---|\n| B2B Sales | Maxi Musterfrau (Head of B2B Sales) | tut etwas |\n| Business Class | Hans Beispiel, Erika Mustermann | tut etwas |",
    "| Person | Rolle |\n|---|---|\n| Felix Testmann | Sponsor |\n| Tobias (CIO) | Sponsor |",
  ]);
  for (const n of ["Maxi Musterfrau", "Musterfrau", "Hans Beispiel", "Erika Mustermann", "Felix Testmann", "Testmann", "Tobias"]) assert.ok(namen.includes(n), n);
  assert.ok(!namen.includes("B2B Sales"));
});

test("Prüfung: Namen, Länge, Markdown, erfundene Zahlen", () => {
  const basis = { rolle: "bpm", an: "bpm", namen: ["Maxi Musterfrau", "Musterfrau"], kontext: "Im Wissen steht 30 % und 1.500 Geräte." };
  assert.deepEqual(pruefeAntwort({ ...basis, text: "Das ist sauber. Laut Wissen sind es 30 % und 1.500 Geräte." }), []);
  assert.equal(pruefeAntwort({ ...basis, text: "Frag Musterfrau." })[0]?.regel, "name");
  // Steht der Name im Wissen (Organisationsübersicht), darf ihn die Antwort nennen
  assert.equal(pruefeAntwort({ ...basis, erlaubteNamen: "Maxi Musterfrau, Teamlead", text: "Frag Musterfrau." }).filter((x) => x.regel === "name").length, 0);
  assert.equal(pruefeAntwort({ ...basis, text: "Eins. Zwei. Drei. Vier. Fünf. Sechs. Sieben." })[0]?.regel, "laenge");
  assert.equal(pruefeAntwort({ ...basis, an: "alle", text: "Eins. Zwei. Drei. Vier." })[0]?.regel, "laenge");
  assert.equal(pruefeAntwort({ ...basis, text: "- Punkt eins\n- Punkt zwei" })[0]?.regel, "markdown");
  assert.equal(pruefeAntwort({ ...basis, text: "Das spart 45 % Zeit." })[0]?.regel, "zahl");
  assert.equal(pruefeAntwort({ ...basis, text: "BPM-Experte: Das ist falsch gelabelt." })[0]?.regel, "markdown");
});

test("Modellantwort lesen, auch im Code-Block", () => {
  const json = leseJson('Hier:\n```json\n{"antworten":[{"rolle":"sales","text":" Hallo. "},{"rolle":"x","text":""}]}\n```');
  assert.deepEqual(leseAntworten(json), [{ rolle: "sales", text: "Hallo." }]);
  assert.throws(() => leseAntworten({}));
});

test("Agenda für den Test aus testfragen.md lesen", async () => {
  const { liesAgenda } = await import("../scripts/agententest-kern.ts");
  const md = "- A1: Auftakt (08:00)\n- A2: Ist-Analyse\n- A3: Neu denken\n- A4: Soll-Prozess\n- A5: Umsetzung\n- Sonstiges: nicht dabei";
  assert.deepEqual(liesAgenda(md), ["Auftakt (08:00)", "Ist-Analyse", "Neu denken", "Soll-Prozess", "Umsetzung"]);
  assert.deepEqual(liesAgenda("nichts"), []);
});

test("Ausschnitt einer T-Frage: ausdrücklich genannt oder der des Blocks", async () => {
  const { ausschnittVon, liesAusschnitte } = await import("../scripts/agententest-kern.ts");
  assert.equal(ausschnittVon({ frage: "Was fällt auf? (Ausschnitt A2b)", block: "A2" }), "A2b");
  assert.equal(ausschnittVon({ frage: "Was fällt auf? (Ausschnitt A3)", block: "A3" }), "A3");
  assert.equal(ausschnittVon({ frage: "Ohne Hinweis", block: "A4" }), "A4");
  assert.equal(liesAusschnitte('- **Ausschnitt A2b:** "Zweiter Text."').A2b, "Zweiter Text.");
});

test("Prüfung: Ideenpool-Nummern und Pain-Point-Kürzel dürfen nicht gesprochen werden", () => {
  const basis = { rolle: "consultant", an: "consultant", namen: [], kontext: "" };
  assert.deepEqual(pruefeAntwort({ ...basis, text: "Hier hilft die Wiedervorlage für Angebote bei B2B Sales und Business Class." }), []);
  assert.equal(pruefeAntwort({ ...basis, text: "Dafür passt Idee 20." })[0]?.regel, "nummer");
  assert.equal(pruefeAntwort({ ...basis, text: "Das ist Pain Point B6." })[0]?.regel, "nummer");
  assert.equal(pruefeAntwort({ ...basis, text: "Passende Lösungen (20, 54) gibt es." })[0]?.regel, "nummer");
  assert.equal(pruefeAntwort({ ...basis, text: "Nach 8 bis 12 Wochen (Q4) prüfen wir das." }).filter((x) => x.regel === "nummer").length, 0);
});

test("Prüfung: gerundete Prozentwerte aus dem Wissen sind erlaubt", () => {
  const basis = { rolle: "sales", an: "sales", namen: [], kontext: "Zielerreichung 33,3 % und 20,2 % laut CRM." };
  assert.deepEqual(pruefeAntwort({ ...basis, text: "Es sind nur etwa 33 % und 20 % des Ziels." }), []);
  assert.equal(pruefeAntwort({ ...basis, text: "Das spart 45 % Zeit." })[0]?.regel, "zahl");
});

test("Ideennamen: Einzelname statt Bündelname, unbekannte Namen und Ränge werden erkannt", async () => {
  const { pruefeIdeennamen } = await import("../scripts/agententest-kern.ts");
  const ideen = { top25: ["DaaS-Anfrage-Abwickler", "Angebots-Nachfass-Bot"], weitere: ["Forecast-Erklärer"], einzelnamen: ["Margen-Wächter", "Nachfass-Texter"] };
  assert.deepEqual(pruefeIdeennamen("Dafür passt der DaaS-Anfrage-Abwickler und als weitere Idee der Forecast-Erklärer.", "Was hilft?", ideen), []);
  assert.equal(pruefeIdeennamen("Der Margen-Wächter prüft die Marge.", "Was hilft bei der Marge?", ideen)[0]?.regel, "ideenname");
  assert.deepEqual(pruefeIdeennamen("Der Margen-Wächter gehört zum DaaS-Anfrage-Abwickler.", "Gibt es einen Margen-Wächter?", ideen), []);
  assert.match(pruefeIdeennamen("Hier hilft der Preis-Optimierer-Bot.", "Was hilft?", ideen)[0]?.text ?? "", /nicht in der Ideenliste/);
  const { pruefeAntwort } = await import("../scripts/agententest-kern.ts");
  assert.equal(pruefeAntwort({ rolle: "consultant", an: "consultant", namen: [], kontext: "", text: "Das ist Rang 4 der Liste." }).some((x) => x.regel === "nummer"), true);
});
