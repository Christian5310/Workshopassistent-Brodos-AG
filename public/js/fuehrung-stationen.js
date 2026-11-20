// Drehbuch der Führung durch die App (Merlin, Startscreen). Hier Texte und Bilder ändern.
// - text:   was Merlin sagt (nur Sprachausgabe, steht nicht auf dem Bildschirm). "Broki" so schreiben, wie es gesprochen wird.
//           In ganzen Sätzen schreiben: das Vorlesen läuft satzweise.
// - bilder: Bubbles (Kreise) rechts neben Merlin. Ohne Bilder bleibt Merlin allein in der Mitte.
//     datei:  Datei in public/img/fuehrung/ (mit Endung, z. B. "assistent-1.png"). Ideal: quadratig, das Wichtige in der Mitte.
//     titel:  Beschreibung für Screenreader
//     x, y:   Mitte der Bubble in Prozent der Bühne (x 50 = Bildmitte, y 50 = Bildmitte). Links ab etwa x 40 ist Platz.
//     groesse: Durchmesser in "vmin" (etwa 58 = groß, 26 = klein)
//     von:    woher sie hereinfährt: "rechts", "unten", "oben" oder "links"
//     nach:   Verzögerung in Millisekunden nach dem Beginn der Station (für die zweite und dritte Bubble)
//     fokus, zoom: bei breiten Screenshots, was in den Kreis soll: Mittelpunkt in Prozent ("70% 55%") und Vergrößerung (1 = ganzes Quadrat)
// Die Platzhalter-Bilder entstehen mit "node scripts/fuehrung-bilder.mjs" (siehe docs/uebergabe/fuehrung.md).
export const FUEHRUNG = [
  {
    text: "Hallo zusammen! Ich bin Merlin und ich zeige euch nun, wie die neue Broki Meeting App funktioniert. Los geht's!",
  },
  {
    text: "Hier startet ihr. Entweder mit einem Meeting für den Arbeitsalltag oder mit einem Workshop für den großen Rahmen, mit Teilnehmenden und Material. Einfach auswählen, Agenda eintragen, fertig.",
    bilder: [{ datei: "meeting.png", titel: "Meeting oder Workshop wählen", x: 69, y: 47, groesse: 60, von: "rechts", fokus: "35% 40%", zoom: 1.15 }],
  },
  {
    text: "Dann geht's los! Ihr startet die Aufnahme, ich höre zu und schreibe mit. Daraus entstehen live die To-dos und die Entscheidungen. Und keine Sorge: Das Audio wird nach der Transkription sofort verworfen.",
    bilder: [
      { datei: "assistent.png", titel: "To-dos und Entscheidungen entstehen live", x: 70, y: 55, groesse: 58, von: "unten", fokus: "62% 58%", zoom: 1.5 },
      { datei: "assistent.png", titel: "Die Agenda führt durch das Meeting", x: 45, y: 22, groesse: 25, von: "oben", fokus: "18% 40%", zoom: 2.2, nach: 3500 },
    ],
  },
  {
    text: "Und ihr habt drei Experten dabei. Ihr könnt sie per Sprache fragen oder eure Frage tippen. Wichtig: Sie greifen auf Wissen zurück, das ihr vorher bei ihnen hinterlegen müsst. Je besser das Wissen, desto besser die Antworten.",
    bilder: [
      { datei: "agenten.png", titel: "Drei Experten", x: 68, y: 42, groesse: 56, von: "rechts", fokus: "55% 30%", zoom: 1.5 },
      { datei: "agenten.png", titel: "Antworten im Chat", x: 78, y: 80, groesse: 26, von: "unten", fokus: "58% 72%", zoom: 1.9, nach: 4000 },
    ],
  },
  {
    text: "An der Pinnwand sammelt ihr Material und Ideen. Und im Archiv landet am Ende alles, inklusive Zusammenfassung. Da geht nichts verloren.",
    bilder: [{ datei: "pinnwand.png", titel: "Pinnwand mit Notizen", x: 67, y: 50, groesse: 58, von: "links", fokus: "50% 38%", zoom: 1.45 }],
  },
  {
    text: "Und im Admin stellt ihr alles ein: eure Meetings, die Wissensdateien der Experten, meine Stimme und noch mehr.",
    bilder: [{ datei: "admin.png", titel: "Einstellungen im Admin", x: 69, y: 48, groesse: 58, von: "oben", fokus: "50% 40%", zoom: 1.3 }],
  },
  {
    text: "Das war's auch schon. Neugierig geworden? Dann sagt mir einfach, ob ihr ein Meeting oder einen Workshop abhalten möchtet.",
  },
];
