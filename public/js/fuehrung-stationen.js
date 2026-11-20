// Drehbuch der Führung durch die App (Merlin, Startscreen). Hier Texte und Bilder ändern.
// - text:   was Merlin sagt (nur Sprachausgabe, steht nicht auf dem Bildschirm). "Broki" so schreiben, wie es gesprochen wird.
//           In ganzen Sätzen schreiben: das Vorlesen läuft satzweise.
// - bilder: Bubbles (Kreise) rechts neben Merlin. Ohne Bilder bleibt Merlin allein in der Mitte.
//     datei:  Datei in public/img/fuehrung/ (mit Endung, z. B. "2b.png"). Ideal: quadratig, das Wichtige in der Mitte.
//     titel:  Beschreibung für Screenreader
//     x, y:   Mitte der Bubble in Prozent der Bühne (x 50 = Bildmitte, y 50 = Bildmitte). Links ab etwa x 40 ist Platz.
//     groesse: Durchmesser in "vmin" (etwa 58 = groß, 26 = klein)
//     von:    woher sie hereinfährt: "rechts", "unten", "oben" oder "links"
//     nach:   Verzögerung in Millisekunden nach dem Beginn der Station (für die zweite und dritte Bubble)
//     fokus, zoom: bei nicht quadratischen Bildern, was in den Kreis soll: Mittelpunkt in Prozent ("70% 55%") und Vergrößerung (1 = mittleres Quadrat)
//     passt:  true zeigt das ganze Bild im Kreis (heller Rand oben und unten), gut für breite Bilder mit großer Schrift
// Die Platzhalter-Bilder entstehen mit "node scripts/fuehrung-bilder.mjs" (siehe docs/uebergabe/fuehrung.md).
export const FUEHRUNG = [
  {
    text: "Hallo zusammen! Ich bin Merlin und ich zeige euch nun kurz, wie die neue Broki Meeting App funktioniert. Los geht's!",
  },
  {
    text: "Hier startet ihr. Entweder mit einem Meeting für den Arbeitsalltag oder mit einem Workshop für den großen Rahmen, mit Teilnehmenden und Material. Einfach auswählen, Agenda eintragen, fertig.",
    bilder: [{ datei: "1.png", titel: "Startscreen: Meeting oder Workshop", x: 69, y: 47, groesse: 60, von: "rechts", fokus: "50% 48%", zoom: 1.25 }],
  },
  {
    text: "Dann geht's los! Ihr startet die Aufnahme, ich höre zu und schreibe mit. Daraus entstehen live die To-dos und die Entscheidungen. Und keine Sorge: Das Audio wird nach der Transkription sofort verworfen.",
    bilder: [
      { datei: "2_aufnahme.png", titel: "Aufnahme starten", x: 47, y: 24, groesse: 27, von: "oben" },
      { datei: "2b.png", titel: "To-dos und Entscheidungen entstehen live", x: 70, y: 58, groesse: 58, von: "unten", fokus: "0% 65%", nach: 4000 },
    ],
  },
  {
    text: "Und ihr habt drei Experten dabei. Ihr könnt sie per Sprache fragen oder eure Frage tippen. Wichtig: Sie greifen auf Wissen zurück, das ihr vorher bei ihnen hinterlegen müsst. Je besser das Wissen, desto besser die Antworten.",
    bilder: [
      { datei: "3.png", titel: "Drei Experten", x: 68, y: 44, groesse: 60, von: "rechts", passt: true, fokus: "50% 42%", zoom: 1.12 },
      { datei: "3b.png", titel: "Material und Wissen hinterlegen", x: 80, y: 82, groesse: 30, von: "unten", fokus: "0% 30%", nach: 4500 },
    ],
  },
  {
    text: "An der Pinnwand sammelt ihr Material und Ideen. Und im Archiv landet am Ende alles, inklusive Zusammenfassung. Da geht nichts verloren.",
    bilder: [
      { datei: "4.png", titel: "Pinnwand mit Notizen", x: 66, y: 46, groesse: 60, von: "links", passt: true, fokus: "50% 42%", zoom: 0.88 },
      { datei: "4b.png", titel: "Alles landet im Archiv", x: 86, y: 78, groesse: 30, von: "unten", nach: 4500 },
    ],
  },
  {
    text: "Und im Admin stellt ihr alles ein: eure Meetings, die Wissensdateien der Experten, meine Stimme und noch mehr.",
    bilder: [
      { datei: "5.png", titel: "Admin in der Navigation", x: 68, y: 48, groesse: 58, von: "oben", passt: true, fokus: "62% 40%", zoom: 1.15 },
      { datei: "5b.png", titel: "Einstellungen zu Merlins Stimme", x: 86, y: 24, groesse: 32, von: "rechts", fokus: "0% 30%", zoom: 1.4, nach: 3500 },
    ],
  },
  {
    text: "Das war's auch schon. Neugierig geworden? Dann legen wir los! Viel Spaß damit.",
  },
];
