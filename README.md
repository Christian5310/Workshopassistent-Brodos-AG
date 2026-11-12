# Workshop Agent (MVP)

Transkriptions-Assistent und Spezial-Agenten für den Sales Agentic Workshop am 26.11.2026.
Der interne Projektkontext (`CLAUDE.md`) liegt bewusst nicht im Repository.

**Stand:** Schritt 1 + 2 – Gerüst und Mock-Modus. Es läuft noch kein echtes Audio und kein echtes Sprachmodell.

## Starten

```bash
npm install
npm start
```

Dann im Browser `http://localhost:3000` öffnen:

| Ansicht | Zweck |
|---|---|
| `/` | Auswahl: Transkriptions-Assistent oder Spezial-Agenten |
| `/screen1` | Transkriptions-Assistent: An/Aus, Agenda, To-dos, Entscheidungen, offene Fragen |
| `/screen2` | Spezial-Agenten: Agent wählen, Chat mit Texteingabe und Push-to-Talk (Leertaste halten) |
| `/archiv` | Aktuelle Sitzung speichern; gespeicherte Transkripte, Zusammenfassungen, Fragen und Antworten ansehen, herunterladen, löschen |
| `/admin` | Einstellungen: Agenda, Hintergrundwissen, Prompts, Namen und Rollen der Spezial-Agenten, Obergrenze für To-dos |
| `/regie` | Start/Pause, Fragen tippen, Transkript einsehen, Daten löschen |

Den Transkriptions-Assistenten einschalten (Knopf oben in der Ansicht): Alle 8 s (`MOCK_CHUNK_SECONDS`) kommt ein Abschnitt aus dem Fake-Transkript, der Fake-Chronist aktualisiert Screen 1.
Ist das Skript durch, in der Regie **Alle Daten löschen** für einen neuen Durchlauf.

Entwicklung mit automatischem Neustart: `npm run dev`. Typprüfung: `npm run typecheck`.

## Aufbau

```
config/agenda.json          Standard-Agenda (Platzhalter; gepflegt wird sie in /admin)
src/server.ts               HTTP-API, Zyklus, Live-Updates (SSE)
src/types.ts                Datenmodell + Schema-Validierung (zod)
src/store.ts                Speicher: data/state.json
src/einstellungen.ts        Admin-Einstellungen (data/einstellungen.json), Prompt-Platzhalter, Sicherheitsnetz für To-dos
src/archiv.ts               Archiv: data/archiv/<id>.json
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
| `POST /api/chat` | `{ text, an }` oder `{ sprache: true, an }`; `an` = `alle`, `sales`, `bpm`, `consultant` |
| `GET/POST/DELETE /api/archiv`, `GET/DELETE /api/archiv/:id`, `GET /api/archiv/:id/markdown` | Archiv: speichern, lesen, herunterladen, löschen |
| `GET/PUT /api/admin/einstellungen`, `GET /api/admin/vorschau` | Admin: Einstellungen lesen/speichern, fertigen Prompt ansehen |
| `POST /api/vorschlag/:id/annehmen` · `verwerfen` | Unsicheres To-do übernehmen oder verwerfen |
| `GET /api/archiv/:id/broki` | Zusammenfassungs-Prompt + Protokoll + Transkript zum Einfügen in Broki |
| `POST /api/regie/start` · `pause` · `reset` | Aufnahme steuern, alle Daten löschen |

## Hinweise

- Der Server lauscht nur auf `127.0.0.1`. Die Regie hat keinen Login, deshalb `HOST` nur bewusst ändern.
- API-Keys gehören in `.env` (Vorlage: `.env.example`) und nie ins Frontend.
- Inhalte des Mock-Skripts sind frei erfunden.
