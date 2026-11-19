// Drehbuch der Führung durch die App (Merlin, Startscreen). Hier Texte, Bilder und Hervorhebungen ändern.
// - text:  was Merlin sagt (wird vorgelesen und steht in seiner Sprechblase). "Broki" so schreiben, wie es gesprochen wird.
// - bild:  Datei in public/img/fuehrung/<bild>.png (Bildschirmfoto der App). Ohne Bild bleibt Merlin allein in der Mitte.
// - titel: Unterschrift unter dem Bild
// - licht: Punkte der oberen Navigation, die leuchten (meeting, workshop, archiv, admin, regie)
// Die Bilder entstehen mit "node scripts/fuehrung-bilder.mjs" (siehe docs/uebergabe/fuehrung.md).
export const FUEHRUNG = [
  {
    text: "Hallo zusammen! Ich bin Merlin und ich zeige euch nun, wie die neue Broki Meeting App funktioniert. Los geht's!",
  },
  {
    bild: "meeting",
    titel: "Meeting oder Workshop wählen",
    licht: ["meeting", "workshop"],
    text: "Hier startet ihr. Entweder mit einem Meeting für den Arbeitsalltag oder mit einem Workshop für den großen Rahmen, mit Teilnehmenden und Material. Einfach auswählen, Agenda eintragen, fertig.",
  },
  {
    bild: "assistent",
    titel: "Der Meeting Assistent",
    text: "Dann geht's los! Ihr startet die Aufnahme, ich höre zu und schreibe mit. Daraus entstehen live die To-dos und die Entscheidungen. Und keine Sorge: Das Audio wird nach der Transkription sofort verworfen.",
  },
  {
    bild: "agenten",
    titel: "Drei Experten an eurer Seite",
    text: "Und ihr habt drei Experten dabei. Ihr könnt sie per Sprache fragen oder eure Frage tippen. Wichtig: Sie greifen auf Wissen zurück, das ihr vorher bei ihnen hinterlegen müsst. Je besser das Wissen, desto besser die Antworten.",
  },
  {
    bild: "pinnwand",
    titel: "Pinnwand und Archiv",
    licht: ["archiv"],
    text: "An der Pinnwand sammelt ihr Material und Ideen. Und im Archiv landet am Ende alles, inklusive Zusammenfassung. Da geht nichts verloren.",
  },
  {
    bild: "admin",
    titel: "Admin: alles einstellen",
    licht: ["admin"],
    text: "Und im Admin stellt ihr alles ein: eure Meetings, die Wissensdateien der Experten, meine Stimme und noch mehr.",
  },
  {
    text: "Das war's auch schon. Neugierig geworden? Dann sagt mir einfach, ob ihr ein Meeting oder einen Workshop abhalten möchtet.",
  },
];
