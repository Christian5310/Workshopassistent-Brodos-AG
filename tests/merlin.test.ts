// Ausführen: npm.cmd test
// Prüft Merlins feste Regeln für die Sätze aus dem Workshop (Stand 19.11.2026).
import { test } from "node:test";
import assert from "node:assert/strict";
import { aufloesen, deuteZuruf, regeln, stichwort, dauerInSekunden, dauerText } from "../src/merlin.ts";

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

test("To-dos per Stimme: abhaken, ändern, löschen", () => {
  assert.deepEqual(regeln("Hake die Preisliste ab"), { aktion: "todo-erledigt", todo: "preisliste" });
  assert.deepEqual(regeln("Merlin, hake das To-do CRM-Export ab"), { aktion: "todo-erledigt", todo: "crm export" });
  assert.deepEqual(regeln("Setze beim To-do Preisliste die Frist auf Montag"), { aktion: "todo-aendern", todo: "preisliste", frist: "Montag" });
  assert.deepEqual(regeln("Lösche das To-do Preisliste"), { aktion: "todo-loeschen", todo: "preisliste" });
  assert.equal(aktion("Lösche die Notiz"), "loeschen"); // ohne To-do bleibt es beim Hinweis
  assert.equal(aktion("Ignoriere das"), "nein");
});

test("Freihand: Stichwort am Satzanfang", () => {
  assert.equal(stichwort("Merlin, öffne die Agenten").art, "exakt");
  assert.equal(stichwort("Hey Merlin öffne die Agenten").art, "exakt");
  assert.equal(stichwort("Merlin, To-do für Anna: Export bis Freitag.").rest, "To-do für Anna: Export bis Freitag.");
  assert.equal(stichwort("Marlin öffne die Agenten").art, "aehnlich");
  assert.equal(stichwort("Berlin ist ein wichtiger Standort").art, "aehnlich");
  // Mitten im Satz zählt nicht
  assert.equal(stichwort("Wir haben das mit Merlin besprochen").art, "keins");
  assert.equal(stichwort("Der Fachhandel sitzt in Berlin und Fulda").art, "keins");
});

test("Freihand: was Merlin aus einem Satz macht", () => {
  // Ohne Namen: nie
  assert.deepEqual(deuteZuruf("Öffne die Agenten", "stichwort"), { art: "ignoriert" });
  assert.deepEqual(deuteZuruf("Wir sollten die Aufnahme starten", "stichwort"), { art: "ignoriert" });
  // Name eindeutig: ausführen
  assert.deepEqual(deuteZuruf("Merlin, zu den Agenten", "stichwort"), { art: "befehl", text: "zu den Agenten", sicher: true, ki: true });
  // Nur der Name: Merlin ruft "Ja?"
  assert.deepEqual(deuteZuruf("Merlin.", "stichwort"), { art: "gerufen" });
  // Name nur ähnlich: nachfragen, aber nur wenn der Rest ein klarer Befehl ist
  assert.deepEqual(deuteZuruf("Marlin, zu den Agenten", "stichwort"), { art: "befehl", text: "zu den Agenten", sicher: false, ki: false });
  assert.deepEqual(deuteZuruf("Berlin hat 1.600 Kunden", "stichwort"), { art: "ignoriert" });
  // Nach "Ja?" genügt ein klarer Befehl ohne Namen, Gerede nicht
  assert.deepEqual(deuteZuruf("zu den Agenten", "folge"), { art: "befehl", text: "zu den Agenten", sicher: true, ki: false });
  assert.deepEqual(deuteZuruf("also ich denke das passt schon", "folge"), { art: "ignoriert" });
  // Auf eine Rückfrage: Ja nur bei Ja, alles andere (auch Weiterreden) ist Nein
  assert.deepEqual(deuteZuruf("Ja", "antwort"), { art: "antwort", aktion: "ja" });
  assert.deepEqual(deuteZuruf("Merlin, ja bitte", "antwort"), { art: "antwort", aktion: "ja" });
  assert.deepEqual(deuteZuruf("Nein", "antwort"), { art: "antwort", aktion: "nein" });
  assert.deepEqual(deuteZuruf("Ignoriere das", "antwort"), { art: "antwort", aktion: "nein" });
  assert.deepEqual(deuteZuruf("Wir müssen noch über die Preise reden", "antwort"), { art: "antwort", aktion: "nein" });
});

test("Tagesablauf: feste Ansage zum Workshop-Start", () => {
  for (const satz of ["Merlin, wie ist der Tagesablauf?", "Erzähl uns den Tagesablauf", "Worum geht es im heutigen Workshop?", "Was machen wir heute?", "Wie sieht der Ablauf heute aus?"]) {
    assert.deepEqual(regeln(satz), { aktion: "tagesablauf" }, satz);
  }
  for (const satz of ["Wie sieht die Agenda aus?", "Lies die Agenda vor", "Zu den Agenten", "Wie spät ist es?"]) {
    assert.notEqual(aktion(satz), "tagesablauf", satz);
  }
});

test("To-do hinzufügen: auch bei Hörfehlern, und der Text darf im nächsten Satz folgen", () => {
  for (const satz of ["Füge ein To-do hinzu", "Füge ein Todo hinzu", "Fügt ein Tool hinzu", "Füge ein neues To-do hinzu: Raum buchen", "To-do erstellen", "To do erstellen", "Erstelle ein To-do: Raum buchen", "Erstelle ein Todo für Anna: Preisliste prüfen", "Todo anlegen"]) {
    assert.equal(regeln(satz)?.aktion, "todo-neu", satz);
  }
  assert.deepEqual(regeln("Füge ein To-do hinzu: Meeting Raum buchen für Montag"), { aktion: "todo-neu", text: "Meeting Raum buchen", owner: undefined, frist: "Montag" });
  // ohne Text fragt Merlin nach; der nächste Satz zählt dann auch ohne Namen als Text
  assert.deepEqual(deuteZuruf("Meeting Raum buchen für Montag", "todo"), { art: "befehl", text: "Neues To-do: Meeting Raum buchen für Montag", sicher: true, ki: false });
  assert.deepEqual(deuteZuruf("Merlin, Preisliste prüfen", "todo"), { art: "befehl", text: "Neues To-do: Preisliste prüfen", sicher: true, ki: false });
  assert.equal(deuteZuruf("Meeting Raum buchen", "stichwort").art, "ignoriert");
});

test("Umgangssprachliche Varianten aus der Merlin-Liste", () => {
  const fall: [string, string][] = [
    ["gehe zum Hauptfenster", "gehe"], ["gehe zum Startscreen", "gehe"], ["lege ein neues Meeting an", "meeting-neu"],
    ["start die Aufnahme", "aufnahme-start"], ["setzte die Aufnahme fort", "aufnahme-start"], ["Wir stoppen das Meeting", "aufnahme-pause"],
    ["Wir machen eine Pause", "aufnahme-pause"], ["gehe zu den Agenten", "gehe"], ["wie lautet die Agenda", "ansage"],
  ];
  for (const [satz, erwartet] of fall) assert.equal(regeln(satz)?.aktion, erwartet, satz);
  assert.deepEqual(regeln("gehe zum Hauptfenster"), { aktion: "gehe", ziel: "start" });
  assert.deepEqual(regeln("lege ein neues Meeting an"), { aktion: "meeting-neu", name: "" });
});

test("Agendapunkt wechseln, Rückgängig, Entscheidung und offene Frage notieren", () => {
  assert.deepEqual(regeln("Weiter zum nächsten Punkt"), { aktion: "punkt-wechseln", ziel: "@weiter" });
  assert.deepEqual(regeln("gehe zum nächsten Agenda Punkt"), { aktion: "punkt-wechseln", ziel: "@weiter" });
  assert.deepEqual(regeln("Zurück zum vorherigen Punkt"), { aktion: "punkt-wechseln", ziel: "@zurueck" });
  assert.deepEqual(regeln("Starte Punkt 2"), { aktion: "punkt-wechseln", ziel: "2" });
  assert.deepEqual(regeln("Gehe zu Punkt drei"), { aktion: "punkt-wechseln", ziel: "drei" });
  assert.deepEqual(regeln("Rückgängig"), { aktion: "rueckgaengig" });
  assert.deepEqual(regeln("Mach den letzten Schritt rückgängig"), { aktion: "rueckgaengig" });
  assert.deepEqual(regeln("Notiere eine Entscheidung: Wir starten im Januar"), { aktion: "eintrag-neu", art: "entscheidung", text: "Wir starten im Januar" });
  assert.deepEqual(regeln("Notiere eine offene Frage: Wer zahlt das?"), { aktion: "eintrag-neu", art: "frage", text: "Wer zahlt das?" });
  assert.equal(regeln("Notiere ein To-do: Raum buchen")?.aktion, "todo-neu");
  assert.equal(regeln("Zum Start")?.aktion, "gehe");
});

test("Timer: Dauer erkennen und ansagen", () => {
  assert.equal(dauerInSekunden("Stell einen Timer auf 10 Minuten"), 600);
  assert.equal(dauerInSekunden("Timer 5 Min"), 300);
  assert.equal(dauerInSekunden("Timer auf eine halbe Stunde"), 1800);
  assert.equal(dauerInSekunden("Timer Viertelstunde"), 900);
  assert.equal(dauerInSekunden("Timer 90 Sekunden"), 90);
  assert.equal(dauerInSekunden("Timer auf zehn Minuten"), 600);
  assert.equal(dauerInSekunden("Timer auf 1,5 Stunden"), 5400);
  assert.equal(dauerInSekunden("Stell einen Timer"), null);
  assert.deepEqual(regeln("Stell einen Timer auf 10 Minuten"), { aktion: "timer", sekunden: 600 });
  assert.deepEqual(regeln("Timer abbrechen"), { aktion: "timer-stopp" });
  assert.deepEqual(regeln("Timer stoppen"), { aktion: "timer-stopp" });
  assert.equal(dauerText(600), "10 Minuten");
  assert.equal(dauerText(60), "60 Sekunden");
  assert.equal(dauerText(5400), "1 Stunde 30 Minuten");
});

test("Was sagt der Agent dazu?", () => {
  assert.deepEqual(regeln("Was sagt der BPM Spezialist dazu?"), { aktion: "frage-dazu", an: "bpm spezialist" });
  assert.deepEqual(regeln("Was meint der Vertriebsprofi dazu"), { aktion: "frage-dazu", an: "vertriebsprofi" });
  assert.deepEqual(regeln("Was sagen die Experten dazu"), { aktion: "frage-dazu", an: "experten" });
  assert.deepEqual(regeln("Frage den Business Consultant dazu"), { aktion: "frage-dazu", an: "business consultant" });
  assert.equal(regeln("Frage an den Sales Professional: Wie viele Kunden?")?.aktion, "frage");
});

test("Alternativformulierungen aus der Excel-Liste (Spalte Anmerkung)", () => {
  const fall: [string, string][] = [
    ["gehe zu den Agenten", "gehe"], ["gehe zum Meeting", "gehe"], ["gehe zur Pinnwand", "gehe"], ["gehe ins Archiv", "gehe"],
    ["gehe zu Admin", "gehe"], ["gehe zum Admin Bereich", "gehe"], ["gehe zur Regie", "gehe"], ["gehe zum Hauptfenster", "gehe"],
    ["gehe zum Startscreen", "gehe"], ["gehe zurück zum Workshop", "zurueck"], ["gehe zurück zum Meeting", "zurueck"],
    ["Öffne ein neues Meeting", "meeting-neu"], ["lege ein neues Meeting an", "meeting-neu"], ["start die Aufnahme", "aufnahme-start"],
    ["setzte die Aufnahme fort", "aufnahme-start"], ["wie lautet die Agenda", "ansage"], ["gehe zum nächsten Agenda Punkt", "punkt-wechseln"],
    ["mach den letzten Schritt rückgängig", "rueckgaengig"], ["Wir machen eine Pause", "aufnahme-pause"], ["Wir stoppen das Meeting", "aufnahme-pause"],
    ["Öffne die Pinnwand", "gehe"],
  ];
  for (const [satz, erwartet] of fall) assert.equal(regeln(satz)?.aktion, erwartet, satz);
});
