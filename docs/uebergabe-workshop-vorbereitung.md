# Übergabe: Workshop-Vorbereitung (Teilnehmer-Interviews über Broki)

> Stand 14.11.2026. Für einen neuen Chat gedacht. Workshop: Brodos Sales Agentic Workshop am 26.11.2026.
> Hinweis: Teilnehmernamen stehen bewusst nicht in diesem Repo. Sie werden im neuen Chat genannt bzw. in der App gepflegt.

## Ziel des nächsten Schritts

Teilnehmer bekommen vor dem Workshop **per E-Mail einen Link**. Der Link führt sie in **Broki** (internes Open WebUI) zu einem
**kurzen, geführten Fragenkatalog** (Interview durch die KI). Das Ergebnis landet als Markdown im Workshop-Material
der BroKI-App, wird dort verdichtet und den Agenten als Agenten-Briefing gegeben.

## Abgestimmte Leitplanken (aus dem bisherigen Chat)

- **Erst besprechen, dann bauen.** Vor neuer Entwicklung fragt Claude nach („Solltest du neues entwickeln wollen, frage erst nach").
- **Broki als Interview-Kanal** (nicht eine eigene Interview-Seite in der App). Ergebnis als **Markdown** aus Broki.
- **Namen nur in der Material-Übersicht**, nie im verdichteten Briefing und nie bei den Agenten.
- Keine Sprechererkennung im Workshop; Audio wird nach der Transkription gelöscht.
- API-Keys nur serverseitig in `.env`, nie im Browser, nie im Chat.
- Privater Mistral-Account nur für unkritische Testinhalte. Echte Interviews laufen über Broki.
- Tonalität: Du, locker-professionell, Deutsch.

## Was die App heute schon kann (Repo-Stand)

- **Workshop** (`/app#workshop`, `public/workshops.html`, `public/js/workshops.js`, `src/workshops.ts`):
  - Einrichten: Name, Datum, Agenda, **Teilnehmerliste (Name, Rolle)**; Weiter-Fluss Einrichten → Material → Meeting Assistent.
  - Material: Dateien (.md/.txt) per Ziehen oder Auswählen hochladen, je Datei ein Eintrag, „Von wem" wählbar;
    Text einfügen (einklappbar). Ansehen, Download, Löschen je Eintrag.
  - **Agenten-Briefing**: „Aus Material verdichten" (LLM, ohne Namen, max. ~1.200 Wörter, Input bis 150.000 Zeichen gesamt)
    → prüfen → „Als Briefing übernehmen" (geht ins Meeting des Workshops: `briefing`, `begriffe`).
- **Merlin-Bubble** im Meeting Assistenten: Begrüßung, „Eingereicht" (fasst das Briefing zusammen), Regeln, Agenda; Vorlesen mit
  Stimme/Tempo aus Admin → Erweitert.
- **Admin**: Meetings (Grundeinstellungen), Spezial-Agenten (Rolle + Fachwissen, gilt in allen Meetings), Erweitert (Merlin-Bubble, Prompts).
- LLM-Anbindung OpenAI-kompatibel (`src/anbieter/llm.ts`), Broki per `.env` (`LLM_BASE_URL`, `LLM_CHAT_PATH`, `LLM_API_KEY`, `LLM_MODEL`) möglich.
- API: `/api/workshops` CRUD, `/api/workshops/:id/material` (+ `/:mid`, `?download`), `/verdichten`, `/wissen`.

## Unterschied der Wissensebenen (geklärt)

| | Admin: Fachwissen der Agenten | Workshop: Agenten-Briefing |
|---|---|---|
| Was | Rolle und Expertise | Lage dieses Workshops aus dem eingereichten Material |
| Gilt | ein Agent, alle Meetings | alle teilnehmenden Agenten, nur dieser Workshop |

Der Meeting Assistent (To-do-Erkennung) bekommt das Briefing nicht, nur die Fachbegriffe gehen an die Transkription.

## Offene Fragen für den neuen Chat

1. **Broki-Seite:** Custom-Modell / Workspace-Modell in Open WebUI mit System-Prompt „Interviewer" anlegen?
   Lässt sich per Link direkt dieses Modell öffnen (z. B. Modell-Parameter in der URL)? In Broki-Staging prüfen (Christian hat Admin-Rechte).
2. **Fragenkatalog:** Welche 6–10 Fragen? Bezug zur Agenda (Ist-Vertriebsprozess, Schmerzpunkte, Systeme, Zahlen, Wünsche an KI)?
   Dauer pro Person (Vorschlag: 10–15 Minuten)?
3. **Abschluss im Interview:** Broki gibt am Ende eine Markdown-Zusammenfassung aus, die die Person prüft. Wie kommt sie in die App?
   - a) Person kopiert/lädt `.md` herunter und schickt sie per Mail → Christian lädt sie im Material hoch (kein Entwicklungsaufwand).
   - b) Später: Upload-Link je Teilnehmer in der App (neue Entwicklung, erst nach Rückfrage).
4. **E-Mail:** Einladungstext (Zweck, Link, Dauer, Frist, Datenschutz-Hinweis: Namen nur intern, Briefing anonym). Versand aus Outlook durch Christian
   oder Text aus der App kopierbar?
5. **Status je Teilnehmer** in der App (eingeladen / Material eingegangen)? Wurde früher als Idee angeboten, noch nicht entschieden.
6. **Frist** vor dem 26.11. (z. B. 21.11.), damit Verdichten und Prüfen noch Zeit haben.

## Vorgeschlagene Reihenfolge

1. Fragenkatalog und Interviewer-Prompt formulieren (kein Code).
2. In Broki-Staging als Modell anlegen und selbst testen; Link-Format klären.
3. Einladungsmail schreiben.
4. Entscheiden, ob die App etwas dazu braucht (Einladungstext kopieren, Status je Teilnehmer) – erst dann entwickeln.
