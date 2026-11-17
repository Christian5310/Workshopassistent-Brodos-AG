# BroKI – KI Meeting Agent (Brodos Sales Agentic Workshop)

Prototyp für einen ganztägigen Workshop am 26.11.2026. Ein Moderations-Laptop nimmt auf, Merlin (Assistent)
führt live die To-do-Liste, Spezial-Agenten beantworten Fragen. Robust für einen Tag, kein Produktivsystem.

## Technik

- Node/TypeScript ohne Build (`tsx`), Express 5, zod 4, Server-Sent Events. Frontend: Vanilla-JS-Module in `public/`, App-Rahmen `public/app.html` + `js/shell.js` mit iframes.
- Daten als JSON in `data/` (je Meeting `data/tage/<id>.json`, `einstellungen.json`, `aktiv.json`). Keine Datenbank.
- Start: `npm.cmd start` (Port 3000). Tests: `npm.cmd test`. Typen: `npm.cmd run typecheck`.
- Mock-Modus (`MOCK_MODE=true`) läuft ohne Schlüssel mit Fake-Transkript.

## KI-Dienste (per `.env`, siehe README)

- Transkription umschaltbar in Admin → Erweitert: Mistral Voxtral (Cloud, Standard), Whisper large-v3 / Turbo (lokal, `lokal/`).
- Logik über Broki (Open WebUI, OpenAI-kompatibel): `LLM_MODEL` für Agenten/Merlin/Zusammenfassung, `LLM_MODEL_PROTOKOLL` = Broki-Modell mit dem Prompt des Transkriptionsassistenten (wird in Broki gepflegt, nicht in der App).
- Ohne `LLM_*`-Zeilen läuft die Logik über Mistral (Fallback).

## Wichtige Abläufe im Code

- `src/server.ts` → `verarbeiteAbschnitt`: Transkript-Abschnitt → `chronist` (src/anbieter/llm.ts) → `wendeAenderungenAn` (src/delta.ts) → `ProtokollSchema` → `absichern` (src/einstellungen.ts: Duplikate, IDs, Obergrenze) → Sprachbefehle.
- Die KI bekommt nur den laufenden Agendapunkt vollständig plus eine Kurzliste anderer offener To-dos und liefert nur Änderungen (`neu`, `erledigt`, `beantwortet`, `befehle`, `frage`).
- Modelle ohne JSON-Modus: `src/anbieter/json-reparatur.ts` + ein zweiter Versuch.
- Parameter je Modell passen sich automatisch an (Temperatur, max_completion_tokens, JSON-Modus).
- Takt je Meeting (`zyklusSekunden` am Meeting; Standard Meeting 30 s, Workshop 45 s).
- Assistent (`public/js/screen1.js`): Hauptliste = aktuelle To-dos des laufenden Punkts; Häkchen legt ab (`gruppe: "abgelegt"`); Ablage je Agendapunkt per Ordner, Drag & Drop.

## Regeln (nicht verhandelbar)

- Keine Sprechererkennung. Audio nach der Transkription sofort verwerfen. Einverständnis vor jeder Aufnahme.
- API-Schlüssel nur in `.env`, nie im Browser, Chat oder Commit.
- Agenda steuert die Moderation, nicht die KI.
- Namen aus eingereichtem Material nie im Briefing oder bei den Agenten.

## Zusammenarbeit

- Du-Form, Deutsch, kurz und strukturiert. Keine erfundenen Fakten; bei Unklarheit nachfragen.
- Vor neuen Funktionen erst erklären und Okay abwarten. Den Broki-Prompt nicht ohne Rücksprache ändern.
- Nach jeder Änderung: `npm.cmd test`, Commit, Push, Anleitung zum Aktualisieren.
- Details: `docs/uebergabe/` (Entscheidungen, offene Punkte, Tests, Workshop-Aufbau).
