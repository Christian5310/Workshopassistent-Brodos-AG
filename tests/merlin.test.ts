// Ausführen: npm.cmd test
// Prüft Merlins feste Regeln für die Sätze aus dem Workshop (Stand 19.11.2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { aufloesen, regeln } from "../src/merlin.ts";

const aktion = (satz: string) => regeln(satz)?.aktion ?? null;

test("Schließen: Meeting und Workshop, mit und ohne „aktuell“", () => {
  for (const satz of ["Schließe das Meeting", "Merlin, schließe den aktuellen Workshop", "Merlin schließe das aktuelle Meeting", "Workshop beenden", "Mach das Meeting zu"]) {
    assert.equal(aktion(satz), "meeting-schliessen", satz);
  }
});

test("Pausieren hält nur die Aufnahme an", () => {
  for (const satz of ["Pausiere das Meeting", "Pausiere den Workshop", "Meeting pausieren", "Pause"]) {
    assert.equal(aktion(satz), "aufnahme-pause", satz);
  }
});

test("Agenda-Fragen lesen die Agenda vor", () => {
  for (const satz of ["Wie sieht die Agenda aus?", "Gibt es eine Agenda?", "Lies die Agenda vor"]) {
    assert.deepEqual(regeln(satz), { aktion: "ansage", station: "agenda" }, satz);
  }
});

test("Material-Fragen fassen das Eingereichte zusammen", () => {
  for (const satz of ["Was haben wir an Material?", "Gibt es Vorbereitungen?", "Lies das eingereichte Material vor"]) {
    assert.deepEqual(regeln(satz), { aktion: "ansage", station: "eingereicht" }, satz);
  }
});

test("Dokument öffnen geht an die Materialsuche", () => {
  assert.equal(aktion("Öffne das Dokument zum Ist-Prozess"), "material");
});

test("Uhrzeit", () => {
  assert.equal(aktion("Merlin, wie spät ist es?"), "uhrzeit");
  const e = aufloesen({ aktion: "uhrzeit" }, false);
  assert.match(e.antwort, /^Es ist \d{2}:\d{2} Uhr\.$/);
});

test("Ja und Nein nur als kurze Antwort", () => {
  assert.equal(aktion("Ja"), "ja");
  assert.equal(aktion("Ja, bitte"), "ja");
  assert.equal(aktion("Nein"), "nein");
  assert.equal(aktion("Lieber nicht"), "nein");
  assert.notEqual(aktion("Ja, und dann lies bitte die Agenda vor"), "ja");
});

test("To-do anlegen: Text, Owner und Frist", () => {
  assert.deepEqual(regeln("Neues To-do für Anna: CRM-Export bis Freitag"), { aktion: "todo-neu", text: "CRM-Export", owner: "Anna", frist: "Freitag" });
  assert.deepEqual(regeln("Merlin, neues To-do: Preisliste prüfen für Tom bis nächsten Montag"), { aktion: "todo-neu", text: "Preisliste prüfen", owner: "Tom", frist: "nächsten Montag" });
  assert.deepEqual(regeln("Notiere ein To-do: Angebot an Müller schicken"), { aktion: "todo-neu", text: "Angebot an Müller schicken", owner: undefined, frist: undefined });
});

test("To-do verschieben", () => {
  assert.deepEqual(regeln("Verschiebe das To-do CRM-Export zu Punkt 3"), { aktion: "todo-verschieben", todo: "crm export", ziel: "punkt 3" });
  assert.equal(aktion("Schieb den CRM-Export nach Preise"), "todo-verschieben");
  assert.notEqual(aktion("Verschiebe das Meeting auf morgen"), "todo-verschieben");
});

test("Pinnwand öffnen", () => {
  assert.deepEqual(regeln("Öffne die Pinnwand"), { aktion: "gehe", ziel: "pinnwand" });
  assert.deepEqual(regeln("Merlin, zeig mir die Pinnwand"), { aktion: "gehe", ziel: "pinnwand" });
});

test("Führung durch die App", () => {
  for (const satz of ["Merlin, erklär uns die App", "Zeig uns die App", "Führung durch die App", "Mach einen Rundgang", "Wie funktioniert die neue Broki Meeting App?", "Erkläre uns bitte kurz die Anwendung", "Tour starten"]) {
    assert.deepEqual(regeln(satz), { aktion: "fuehrung" }, satz);
  }
  // Nicht verwechseln mit anderen Befehlen
  for (const satz of ["Zu den Agenten", "Wie sieht die Agenda aus?", "Zeig die letzten Meetings", "Öffne die Pinnwand", "Was kannst du?"]) {
    assert.notEqual(aktion(satz), "fuehrung", satz);
  }
});
