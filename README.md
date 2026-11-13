# Merlin – powered by BroKI (MVP)

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

| Ansicht | Zweck |
|---|---|
| `/` | Eröffnungsbildschirm mit „Eintreten" (noch ohne Login) |
| `/start` | Auswahl: Transkriptions-Assistent oder Spezial-Agenten, dazu Archiv, Admin, Regie |
| `/screen1` | Transkriptions-Assistent: Meeting auswählen, Aufnahme starten/pausieren, Meeting schließen; Agenda, To-dos, Vorschläge, Entscheidungen, offene Fragen |
| `/screen2` | Spezial-Agenten: Agent wählen, Chat mit Texteingabe und Push-to-Talk (Leertaste halten) |
| `/archiv` | Alle Meetings: To-do-Liste, Entscheidungen, Fragen und Antworten, Transkript – je mit Download (Markdown, To-dos auch als CSV) |
| `/admin` | Meetings und Spezial-Agenten zum Aufklappen und Neuanlegen; unter „Erweitert" Prompts und Obergrenze für To-dos |
| `/regie` | Start/Pause, Fragen tippen, Transkript einsehen, Daten löschen |

Den Transkriptions-Assistenten einschalten (Knopf oben in der Ansicht): Alle 8 s (`MOCK_CHUNK_SECONDS`) kommt ein Abschnitt aus dem Fake-Transkript, der Fake-Chronist aktualisiert Screen 1.
Ist das Skript durch, in der Regie die Inhalte des Tages löschen für einen neuen Durchlauf.

Entwicklung mit automatischem Neustart: `npm run dev`. Typprüfung: `npm run typecheck`.

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
public/                     Die drei Ansichten (HTML/CSS/JS ohne Build-Schritt)
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
