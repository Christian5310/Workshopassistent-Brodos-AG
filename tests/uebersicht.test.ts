// Ausführen: npm.cmd test
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatHinweis, istUebersichtsfrage, UEBERSICHT_MAX_ZEILEN, uebersichtsAdressat } from "../src/uebersicht.ts";
import { pruefeAntwort } from "../scripts/agententest-kern.ts";

test("Übersichtsfragen werden erkannt", () => {
  for (const frage of [
    "Was sind die Painpoints aller drei Sales-Bereiche? Mache eine Stichpunktliste.",
    "Gib mir eine Übersicht der Pain Points.",
    "Kannst du das kurz zusammenfassen? Eine Zusammenfassung reicht.",
    "Liste die Lösungen für Business Class auf.",
    "Mach eine Tabelle mit Pain Point und Lösung.",
    "Stelle die Auswertung je Bereich dar.",
    "Fasse die Lösungen für alle drei Bereiche in einer Liste zusammen.",
    "Gib mir bitte eine Liste der Pain Points.",
  ]) assert.equal(istUebersichtsfrage(frage), true, frage);
});

test("Normale Fragen sind keine Übersichtsfragen", () => {
  for (const frage of [
    "Was ist der größte Pain Point bei B2B Sales?",
    "Wie lange dauert eine DaaS-Anfrage heute?",
    "Wir haben eine Ideenliste gesammelt, was haltet ihr davon?",
    "Welche Lösung passt zu versandeten Angeboten?",
    "Gibt es einen Margen-Wächter in der Liste?",
    "Welche Ideen aus der Ideenliste passen zu Business Class?",
    "Steht der Deal-Coach auf der Liste?",
    "Was macht der Margen-Wächter aus der Liste?",
  ]) assert.equal(istUebersichtsfrage(frage), false, frage);
});

test("Bei einer Übersichtsfrage an alle antwortet ein Agent, sonst bleibt der Adressat", () => {
  const ids = ["sales", "consultant", "bpm"];
  assert.equal(uebersichtsAdressat("alle", ids, true), "sales");
  assert.equal(uebersichtsAdressat("alle", ["bpm", "consultant"], true), "bpm");
  assert.equal(uebersichtsAdressat("consultant", ids, true), "consultant"); // angeklickter Agent behält die Frage
  assert.equal(uebersichtsAdressat("alle", ids, false), "alle");
});

test("Format-Hinweis: normal kurz, bei Übersicht mit Stichpunkten", () => {
  const gefragt = [{ id: "sales", name: "Vertriebsexperte" }];
  assert.match(formatHinweis(gefragt, "sales"), /höchstens 6 Sätze/);
  assert.doesNotMatch(formatHinweis(gefragt, "sales"), /Stichpunkt/);
  const ueb = formatHinweis(gefragt, "sales", true);
  assert.match(ueb, new RegExp(`höchstens ${UEBERSICHT_MAX_ZEILEN} Stichpunkte`));
  assert.match(ueb, /Genau eine Antwort\./);
  assert.match(ueb, /"• "/);
});

test("Prüfung einer Übersicht: Stichpunkte erlaubt, Markdown und Überlänge nicht", () => {
  const basis = { rolle: "sales", an: "sales", namen: [], kontext: "", uebersicht: true };
  const gut = "Das sind die Pain Points:\n• B2B Sales: vier Anfragewege\n• Business Class: kein verbindlicher Prozess\n• Inside Sales: Ablauf offen";
  assert.deepEqual(pruefeAntwort({ ...basis, text: gut }), []);
  assert.equal(pruefeAntwort({ ...basis, text: "Nur ein Fließtext ohne Stichpunkte." })[0]?.regel, "format");
  assert.equal(pruefeAntwort({ ...basis, text: "• **fett**\n• zwei" }).some((v) => v.regel === "markdown"), true);
  const zuLang = Array.from({ length: 17 }, (_, i) => `• Punkt ${i + 1}`).join("\n");
  assert.equal(pruefeAntwort({ ...basis, text: zuLang }).some((v) => v.regel === "laenge"), true);
  // Ohne Übersicht bleibt die Aufzählung ein Verstoß
  assert.equal(pruefeAntwort({ ...basis, uebersicht: false, text: "• eins\n• zwei" }).some((v) => v.regel === "markdown"), true);
});
