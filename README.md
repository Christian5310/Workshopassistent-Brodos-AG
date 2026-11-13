# BroKI – KI Meeting Agent (MVP)

Transkriptions-Assistent und Spezial-Agenten für den Sales Agentic Workshop am 26.11.2026.
Der interne Projektkontext (`CLAUDE.md`) liegt bewusst nicht im Repository.

**Stand:** Läuft im Mock-Modus ohne Keys und im Live-Modus mit Mistral Voxtral (Transkription) plus einem OpenAI-kompatiblen Sprachmodell (Mistral oder Broki/Open WebUI).

## Betriebsarten

| Start | Verhalten |
|---|---|
| `npm start` | Mock: Fake-Transkript und Fake-Antworten, kein Mikrofon, keine Keys |
| `MOCK_MIKRO=true npm start` | Mock-Anbieter, aber echte Aufnahme im Browser (testet Mikrofon und Upload) |
| `MOCK_MODE=false` in `.env` | Live: Mikrofon → Voxtral → Sprachmodell. Braucht `MISTRAL_API_KEY`, siehe `.env.example` |

Das Mikrofon funktioniert im Browser nur über `localhost` oder `https://`.

## Starten

```bash
npm install
npm start
```

Dann im Browser `http://localhost:3000` öffnen:

| Adresse | Zweck |
|---|---|
| `/` | Einstiegsseite: Hinweise zur Verarbeitung, Bestätigung des Einverständnisses, „Eintreten" (noch ohne Login) |
| `/app` | App-Rahmen mit der Navigation Übersicht · Assistent · Agenten · Archiv · Admin · Regie |

Der Rahmen bleibt beim Wechsel der Bereiche stehen und hält das Mikrofon. Die Aufnahme läuft deshalb weiter, wenn du vom Assistenten ins Archiv oder in den Admin wechselst. Die Kopfzeile zeigt in jedem Bereich, ob aufgenommen wird.

| Bereich | Inhalt |
|---|---|
| Übersicht | Einstieg nach dem Eintreten: links „KI Transkriptionsassistent" oder „KI Wissensagenten" wählen, dann neu anlegen oder Bestehendes öffnen |
| Assistent | Aufnahme starten/pausieren, Meeting schließen; Agenda, To-dos, Vorschläge, Entscheidungen, offene Fragen |
| Agenten | Spezial-Agenten fragen, per Text oder Push-to-Talk (Leertaste halten) |
| Archiv | Alle Meetings mit To-do-Liste, Entscheidungen, Fragen und Transkript, je mit Download |
| Admin | Meetings, Spezial-Agenten, unter „Erweitert" Prompts, Takt und Aktivierungswort |
| Regie | Diagnose, Text einspeisen, Inhalte löschen |

Der Knopf mit dem Vollbild-Symbol schaltet den Präsentationsmodus: Das Fenster füllt den Bildschirm, die Schrift wächst für den Beamer.

Entwicklung mit automatischem Neustart: `npm run dev`. Typprüfung: `npm run typecheck`.

## Gestaltung

Die Oberfläche folgt der Web-App-Designvorlage Brodos (Version 0.1): Farben, Schrift, Abstände, Einstiegsseite mit Foto, App-Rahmen mit Wellenbild und weißem Fenster, Navigation oben, Auswahlfelder links. Bewusste Abweichungen:

- Neben dem Brodos-Logo steht das BroKI-Logo als App-Name (enthält Gelb).
- Der Hinweis lautet nur „Prototyp", nicht „Beispieldaten": Die App verarbeitet echte Inhalte des Meetings.
- Präsentationsmodus für den Beamer (größeres Fenster, größere Schrift).
- Montserrat ist lokal eingebunden statt über Google Fonts.

## Einverständnis der Teilnehmenden

- Die Einstiegsseite erklärt, was mit den Daten passiert, und verlangt die Bestätigung, dass alle Teilnehmenden informiert und einverstanden sind. Ohne Haken kein Zutritt; ein direkter Aufruf von `/app` führt zurück zur Einstiegsseite.
- Der Server startet keine Aufnahme ohne diese Bestätigung (`POST /api/regie/start` verlangt `einwilligung`).
- Bei jedem Start einer Aufnahme wird die Bestätigung mit Zeitpunkt und Wortlaut am Meeting dokumentiert. Der Nachweis steht im Archiv und im Download.

Das ist eine technische Absicherung, keine rechtliche Prüfung. Rechtsgrundlage, Informationspflichten, Auftragsverarbeitung und die Beteiligung des Betriebsrats sind mit dem Datenschutz der Brodos AG zu klären.

## Sprachbefehle

Das Aktivierungswort (Standard „Merlin") und der Takt der Transkription stehen in der Admin-Ansicht unter „Erweitert".

| Gesprochen | Wirkung |
|---|---|
| „Merlin, To-do für Anna: … bis Freitag" | To-do anlegen |
| „Merlin, hake … ab" | To-do abhaken |
| „Merlin, lösche das To-do …" | Eintrag löschen |
| „Merlin, ändere beim To-do … die Frist auf Montag" | Text, Owner oder Frist ändern |
| „Merlin, Frage an den BPM Specialist: …" | Frage an die Spezial-Agenten (abschaltbar) |

Löschen, Ändern und Fragen greifen nur, wenn das Aktivierungswort im Abschnitt wirklich gefallen ist. Jede Änderung lässt sich mit „Rückgängig" zurücknehmen.

## Aufbau

```
config/agenda.json          Agenda für den ersten, automatisch angelegten Tag
src/server.ts               HTTP-API, Zyklus, Live-Updates (SSE)
src/types.ts                Datenmodell + Schema-Validierung (zod)
src/store.ts                Speicher: ein Meeting = eine Datei in data/tage/ (Agenda, Wissen, Protokoll, Transkript, Chat)
src/einstellungen.ts        Admin-Einstellungen (data/einstellungen.json), Prompt-Platzhalter, Sicherheitsnetz für To-dos
src/archiv.ts               Aufbereitung eines Tages für Ansicht und Download
src/anbieter/               Schnittstellen + Mock (hier kommen Mistral und Broki dazu)
src/mock/skript.ts          Fake-Transkript und Fake-Fragen
public/                     Einstiegsseite, App-Rahmen (app.html, js/shell.js) und die Ansichten (HTML/CSS/JS ohne Build-Schritt)
public/assets/              Logo und Bilder aus der Designvorlage
```

## API (schmal gehalten, damit das Backend tauschbar bleibt)

| Aufruf | Zweck |
|---|---|
| `GET /api/state` | Protokollstand, Chat, Status |
| `GET /api/events` | Dasselbe als Live-Stream (Server-Sent Events) |
| `GET /api/transcript` | Rohtranskript (nur Regie) |
| `POST /api/audio-chunk` | Audio-Schnipsel (Rohdaten, `Content-Type: audio/…`); bleibt nur im Arbeitsspeicher |
| `POST /api/chat` | `{ text, an }` oder `{ sprache: true, an }`; `an` = `alle`, `sales`, `bpm`, `consultant` |
| `GET/POST /api/tage`, `GET/PUT/DELETE /api/tage/:id`, `POST /api/tage/:id/aktivieren` | Meetings anlegen, ändern, auswählen, löschen (Name, Datum, Agenda, Hintergrundwissen, Fachbegriffe) |
| `POST /api/agenten`, `PUT/DELETE /api/agenten/:id` | Spezial-Agenten anlegen, ändern, löschen (Name, Prompt, Wissen, Figur, Farbe) |
| `GET /api/tage/:id/markdown?art=alles\|transkript\|todos\|entscheidungen\|fragen`, `GET /api/tage/:id/todos.csv`, `GET /api/tage/:id/broki` | Downloads bzw. Text zum Einfügen in Broki |
| `POST /api/meeting/schliessen` | Geöffnetes Meeting abschließen: liegt danach im Archiv, der Assistent ist leer |
| `POST /api/rueckgaengig` | Letzte Änderung am Protokoll zurücknehmen (KI oder Hand, bis zu 30 Schritte) |
| `POST /api/agenda/:id/aktiv` | Agendapunkt von Hand auswählen |
| `PATCH/DELETE /api/todos/:id` | To-do bearbeiten, abhaken, löschen |
| `GET/PUT /api/admin/einstellungen`, `GET /api/admin/vorschau` | Admin: Einstellungen lesen/speichern, fertigen Prompt ansehen |
| `POST /api/todos/ablegen` | `{ name }`: aktuelle To-dos unter einer Kategorie ablegen; `{ name, zurueck: true }` holt sie zurück |
| `POST /api/vorschlag/:id/annehmen` · `verwerfen` | Unsicheres To-do übernehmen oder verwerfen |
| `GET /api/regie/diagnose` | Je Abschnitt: was gehört wurde und was der Assistent daraus gemacht hat |
| `POST /api/regie/text` | `{ text }`: Text statt Audio verarbeiten (Test ohne Mikrofon, Plan B) |
| `POST /api/regie/start` · `pause` · `reset` | Aufnahme steuern, alle Daten löschen |

## Hinweise

- Der Server lauscht nur auf `127.0.0.1`. Die Regie hat keinen Login, deshalb `HOST` nur bewusst ändern.
- API-Keys gehören in `.env` (Vorlage: `.env.example`) und nie ins Frontend.
- Inhalte des Mock-Skripts sind frei erfunden.
