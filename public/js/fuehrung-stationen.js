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
export const FUEHRUNG = [
  {
    text: "Hallo zusammen! Willkommen zu eurem heutigen Workshop. Ich bin Merlin, euer Sprachassistent hier in der Broki Meeting App. Die App ist ganz neu und wird heute mit euch zum ersten Mal getestet.",
    bilder: [{ datei: "a.png", titel: "Die App wird zum ersten Mal getestet", x: 69, y: 46, groesse: 52, von: "rechts", nach: 9500 }],
  },
  {
    text: "Hier in der App könnt ihr ein Meeting oder einen Workshop öffnen, transkribieren und sogar mit drei Agenten arbeiten, die auf Spezialfragen für euch eingehen.",
    bilder: [
      { datei: "1.png", titel: "Startscreen: Meeting oder Workshop", x: 69, y: 47, groesse: 60, von: "rechts", fokus: "50% 48%", zoom: 1.25 },
      { datei: "3.png", titel: "Drei Agenten", x: 80, y: 80, groesse: 32, von: "unten", passt: true, nach: 4800 },
    ],
  },
  {
    text: "Wenn ihr die Aufnahme startet, erkenne ich Entscheidungen, offene Fragen und Tu-Dus und zeige sie automatisch an. Und keine Sorge: Das Audio wird nach der Transkription sofort verworfen.",
    bilder: [
      { datei: "2_aufnahme.png", titel: "Aufnahme starten", x: 47, y: 24, groesse: 27, von: "oben" },
      { datei: "b.png", titel: "To-do-Liste", x: 70, y: 57, groesse: 46, von: "unten", passt: true, nach: 4000 },
    ],
  },
  {
    text: "Ihr könnt mich jederzeit mit meinem Namen ansprechen. Sagt einfach „Merlin“ und dann, was ihr braucht, zum Beispiel einen Bereich öffnen, ein Tu-Du anlegen oder abhaken. Ich führe es für euch aus.",
    bilder: [{ datei: "e.webp", titel: "Merlin, der Zauberer", x: 68, y: 47, groesse: 52, von: "rechts", zoom: 0.92, nach: 3000 }],
  },
  {
    text: "Wir haben auch eine Pinnwand. Dort findet ihr die Infodateien, die ihr vorher eingereicht habt, und könnt sie jederzeit abrufen.",
    bilder: [{ datei: "4.png", titel: "Pinnwand mit Notizen", x: 66, y: 46, groesse: 60, von: "links", passt: true, fokus: "50% 42%", zoom: 0.88, nach: 600 }],
  },
  {
    text: "Aber bitte habt Geduld mit mir. Christian und ich haben die App erst vor ein paar Tagen gebaut und müssen uns alle erst einmal gemeinsam einspielen und gemeinsam wachsen.",
    bilder: [
      { datei: "c.webp", titel: "Merlin bittet um Geduld", x: 68, y: 47, groesse: 52, von: "rechts", nach: 500 },
      { datei: "d.webp", titel: "Gemeinsam wachsen", x: 68, y: 47, groesse: 52, von: "rechts", nach: 7000 },
    ],
  },
  {
    text: "Und hier noch ein paar Fun Facts zur KI Arbeit: Mein Code besteht aus rund zwölftausend Zeilen. Das wären über zweihundert Seiten zum Ausdrucken.",
    bilder: [{ datei: "f.jpg", titel: "Zweihundert Seiten Code zum Ausdrucken", x: 68, y: 47, groesse: 52, von: "rechts", fokus: "50% 45%", nach: 6500 }],
  },
  {
    // "[2s]" = zwei Sekunden Pause vor dem nächsten Satz (Zeit zum Raten)
    text: "Und was glaubt ihr: Wie hoch ist der Anteil von KI-Arbeit im Vergleich zu klassischem Code in dieser App? [2s] Achtzig Prozent sind Code, zwanzig Prozent sind KI. KI ist nur ein Teil der Lösung. Aber ein wichtiger Hebel.",
  },
  {
    text: "Auf geht's! Viel Spaß heute, und seid kreativ!",
  },
];
