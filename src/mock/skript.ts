/**
 * Fake-Transkript für den Mock-Modus: ein frei erfundener Workshop-Verlauf.
 * Namen, Zahlen und Inhalte sind Platzhalter und haben nichts mit echten Brodos-Daten zu tun.
 * Jeder Abschnitt trägt die Änderungen, die der Fake-Assistent daraus "erkennt".
 */
export type MockOp =
  | { typ: "agenda"; id: string; status: "läuft" | "erledigt" }
  | { typ: "todo"; text: string; owner?: string; frist?: string }
  | { typ: "vorschlag"; text: string; owner?: string }
  | { typ: "todo_erledigt"; enthaelt: string }
  | { typ: "entscheidung"; text: string }
  | { typ: "frage"; text: string }
  | { typ: "frage_beantwortet"; enthaelt: string }
  | { typ: "notiz"; text: string };

export interface MockAbschnitt {
  text: string;
  ops: MockOp[];
}

export const MOCK_SKRIPT: MockAbschnitt[] = [
  {
    text: "Guten Morgen zusammen. Heute nehmen wir unseren Vertriebsprozess auseinander und bauen ihn mit KI neu auf. Hinweis vorab: Das Gespräch wird transkribiert, ohne Zuordnung zu Personen.",
    ops: [{ typ: "agenda", id: "A1", status: "läuft" }],
  },
  {
    text: "Ziel für heute Abend: ein Soll-Prozess und ein konkreter Pilot. Gut, dann steigen wir ein in den Ist-Prozess an der Deal-Wand.",
    ops: [
      { typ: "agenda", id: "A1", status: "erledigt" },
      { typ: "agenda", id: "A2", status: "läuft" },
    ],
  },
  {
    text: "Eine Anfrage kommt per Mail oder Telefon rein, der Außendienst legt sie in Dynamics an, dann geht das Angebot zum Innendienst. Da liegt es oft mehrere Tage. Da müsste eigentlich mal jemand draufschauen.",
    ops: [
      { typ: "notiz", text: "Angebote liegen zu lange beim Innendienst" },
      { typ: "vorschlag", text: "Liegezeiten der Angebote beim Innendienst prüfen" },
    ],
  },
  {
    text: "Wer ist eigentlich Owner des Angebotsprozesses? Das weiß gerade keiner so genau. Ich kümmere mich darum, dass wir den CRM-Export für Q3 bekommen.",
    ops: [
      { typ: "frage", text: "Wer ist Owner des Angebotsprozesses?" },
      { typ: "todo", text: "CRM-Export Q3 bereitstellen" },
    ],
  },
  {
    text: "Darling, To-do für Anna: Durchlaufzeiten der Angebote aus Dynamics auswerten, bis Freitag.",
    ops: [{ typ: "todo", text: "Durchlaufzeiten der Angebote aus Dynamics auswerten", owner: "Anna", frist: "Freitag" }],
  },
  {
    text: "Okay, der Ist-Prozess steht an der Wand. Nächster Punkt: Wo tut es am meisten weh, wo haben wir Medienbrüche?",
    ops: [
      { typ: "agenda", id: "A2", status: "erledigt" },
      { typ: "agenda", id: "A3", status: "läuft" },
    ],
  },
  {
    text: "Preise werden aus Excel abgetippt, Freigaben laufen per Mail, und bei DaaS+ rechnet jeder anders, das könnte man mal vereinheitlichen. Der Export für Q3 ist übrigens gerade gekommen, der liegt jetzt im Teamordner.",
    ops: [
      { typ: "notiz", text: "Preise werden aus Excel abgetippt, Freigaben per Mail" },
      { typ: "notiz", text: "DaaS+-Kalkulation ist nicht einheitlich" },
      { typ: "vorschlag", text: "DaaS+-Kalkulation vereinheitlichen" },
      { typ: "todo_erledigt", enthaelt: "CRM-Export" },
    ],
  },
  {
    text: "Dann halten wir fest: Owner des Angebotsprozesses ist ab sofort die Vertriebsleitung. Beschlossen.",
    ops: [
      { typ: "entscheidung", text: "Owner des Angebotsprozesses ist die Vertriebsleitung" },
      { typ: "frage_beantwortet", enthaelt: "Owner des Angebotsprozesses" },
    ],
  },
  {
    text: "Tom übernimmt die Liste aller Freigabeschritte mit Wartezeiten. Und welche Daten dürfen wir überhaupt in ein KI-Modell geben?",
    ops: [
      { typ: "todo", text: "Liste aller Freigabeschritte mit Wartezeiten erstellen", owner: "Tom" },
      { typ: "frage", text: "Welche Daten dürfen in ein KI-Modell gegeben werden?" },
    ],
  },
  {
    text: "Gut, die Schmerzpunkte sind klar. Weiter mit dem Soll-Prozess: Was davon ist feste Regel, was braucht Urteilsvermögen?",
    ops: [
      { typ: "agenda", id: "A3", status: "erledigt" },
      { typ: "agenda", id: "A4", status: "läuft" },
    ],
  },
  {
    text: "Angebotsentwurf aus der Anfrage erzeugen, das kann ein Agent. Die Preisfreigabe bleibt beim Menschen. Wir machen das so: Der Agent schreibt den Entwurf, der Innendienst gibt frei.",
    ops: [
      { typ: "entscheidung", text: "Agent erstellt Angebotsentwurf, Innendienst gibt frei" },
      { typ: "notiz", text: "Preisfreigabe bleibt beim Menschen" },
    ],
  },
  {
    text: "Dann zum letzten Punkt: Womit starten wir? Der Pilot startet im Fachhandel, das ist beschlossen.",
    ops: [
      { typ: "agenda", id: "A4", status: "erledigt" },
      { typ: "agenda", id: "A5", status: "läuft" },
      { typ: "entscheidung", text: "Pilot startet im Fachhandel" },
    ],
  },
  {
    text: "Die IT klärt bis Ende nächster Woche mit dem Datenschutz, welche Daten ins Modell dürfen. Danke euch allen, das war's für heute.",
    ops: [
      { typ: "todo", text: "Mit Datenschutz klären, welche Daten ins Modell dürfen", owner: "IT", frist: "Ende nächster Woche" },
      { typ: "agenda", id: "A5", status: "erledigt" },
    ],
  },
];

/** Fragen, die der Mock beim Push-to-Talk "versteht". */
export const MOCK_FRAGEN: string[] = [
  "Wo verlieren wir im Angebotsprozess aus eurer Sicht die meiste Zeit?",
  "Was davon sollten wir klassisch automatisieren und wo lohnt sich ein Agent?",
  "Was wäre ein sinnvoller erster Pilot?",
];
