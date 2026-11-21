# NOTES – Stand der Session (19.11.2026)

## Ziel
- Agenten-Seite kreativer darstellen: drei Agenten als Figuren mit Foto oben, Antworten in Bubbles darunter, unten nur Textfeld + Senden.
- Zuhören wie bei Merlin: Klick 1 = Agent hört zu (Animation), Klick 2 = wertet aus und antwortet sofort.
- Davor in der Session: Pinnwand vereinfacht, Archiv-Zusammenfassung repariert, Protokoll-Prompt gegen To-do-Flut geschärft.

## Entscheidungen (mit Begründung)
- **Zuhören direkt über Mikrofon im Browser** (`/api/chat-audio`), nicht über das Transkript der Aufnahme. Grund: Transkript kommt nur alle 30–45 s, sonst „Nichts gehört".
- **Aufnahme währenddessen stumm** (`merlin().aufnahme.stumm`), damit die Frage nicht ins Protokoll kommt. Audio wird nach Transkription verworfen (Projektregel).
- **Ein Agent zugleich** zuhörend; Klick auf anderen Agenten wechselt.
- **Textfeld-Frage** geht an den zuhörenden Agenten, sonst an alle.
- **Kontext der Agenten: letzte 60 Min Transkript** (max. ca. 60.000 Zeichen), dazu Protokoll, Agenda, Hintergrundwissen, eigene Wissensdatei, letzte 20 Chat-Nachrichten. **Keine Websuche** (bewusst nicht eingebaut; Datenschutz und Broki-Freigabe unklar).
- **Max. 3 Agenten** (`MAX_AGENTEN` in `src/server.ts`; Admin blendet „Neuer Agent" bei 3 aus).
- **Fotos als `figur`-Werte** `frau`, `mann`, `brille` (Standard: Sales→mann, BPM→brille, Consultant→frau).
- **Navigation bleibt links** (Rückmeldung: rechts war verwirrend).
- **Abgeschnittene LLM-Antworten:** Haiku 5.5 „denkt", Denk-Token zählen zum Limit. Deshalb Limit hoch und bei `finish_reason: length` automatisch Retry mit 3-fachem Limit (statt JSON still zu reparieren).
- **Broki-Protokoll-Prompt generisch halten, keine Namen aus dem Material** (Regel). Prompt in Broki wird nur nach Rücksprache geändert.

## Erledigt (alles auf main gepusht)
- `2fb44c1` Pinnwand: Upload, Pin-Häkchen, einfache Notizen, großes Fenster
- `c872b77` / `9e24402` Zusammenfassung nicht mehr abgeschnitten, Prompt geschärft
- `ac73526` Agenten-Bühne (Fotos, Klick-Logik, max. 3, 60-Min-Kontext)
- `b7600db` Navigation links, größere Figuren in einer Reihe, Zuhören direkt per Mikrofon
- `3248f87` Agenten-Antworten nicht mehr abgeschnitten (Limit 4000, Retry bei Längenabbruch)
- `npm.cmd test` 20/20 grün, Typecheck grün

## Offene Punkte / bekannte Bugs
- **Zuhören mit echtem Mikrofon nicht live getestet** (Einwilligung am Bildschirm nötig). Bitte einmal prüfen: Klick, Frage sprechen, Klick, Antwort; Frage darf nicht im Protokoll/Transkript landen.
- Agent-Antwort nennt viele Personennamen (vermutlich aus Wissensdatei/Hintergrundwissen). Prüfen, ob eingereichtes Material enthalten ist; ggf. Namen entfernen oder Rollen-Prompt: „keine Personennamen".
- **Protokoll-Prompt in Broki:** Regel „NEUES TO-DO" generisch formulieren (kein „Kevin"/„Markus Brendel"). Bitte-mit-Zusage zählt als To-do. Echter Testlauf ergab vorher: 0 To-dos, Kevin-Termin nur als Notiz. Erneuten Test mit angepasster Regel noch nicht gemacht.
- Navigation rechts/links: Assistent und Pinnwand unverändert links (Rückfrage erledigt: bleibt links).
- Drittes Agenten-Bild vorhanden (Brille); weitere Agenten gibt es nicht (Limit 3).
- Zweiter Laptop: `git pull`, `npm.cmd install`, Neustart; `data/einstellungen.json` (nicht in Git) hat dort alte Symbole und den alten Zusammenfassungs-Prompt → in Admin nachziehen.
- Offen von früher: Schreibweise „Markus Brendel" vs. „Brendemann"; Broki-STT braucht Broki-Admins; `HOST=0.0.0.0` am Workshop-Tag; 30-Min-Testlauf; Idee Whisper-Startknopf (nicht freigegeben).
- Gespeicherte Archiv-Zusammenfassung ist noch die abgeschnittene → im Archiv neu erzeugen.

## Relevante Dateien
- `public/screen2.html`, `public/js/screen2.js` – Bühne, Klick-Logik, Mikrofon (`klick`, `auswerten`, `aufraeumen`)
- `public/js/common.js` – `avatar()` (BILDER-Map), `zeigeChat`, `zeigeAbhalten`
- `public/css/brodos.css` – Block „Agenten-Bühne" am Dateiende (`.buehne`, `.figur`, `.avatar.gross`)
- `public/img/agent-frau.png`, `agent-mann.png`, `agent-brille.png`
- `src/server.ts` – `MAX_AGENTEN`, `stelleFrage`, `/api/chat`, `/api/chat-audio`, `/api/transkription`
- `src/anbieter/llm.ts` – `#frage` (Retry bei `length`), `expertenrunde` (60-Min-Kontext, Limit 4000), `fasseZusammen`
- `src/einstellungen.ts` – `FIGUREN`, Standard-Agenten, `promptAgentenFertig`, Zusammenfassungs-Prompt
- `public/js/admin.js`, `public/admin.html` – Agentenliste, Limit-Hinweis, Foto-Auswahl
- `public/js/aufnahme.js` – `stumm`-Setter der laufenden Aufnahme
- `docs/uebergabe/broki-protokoll-prompt.md` – Protokoll-Prompt (Vorschlag) für Broki
- Scratchpad (nicht im Repo): `protokoll-neu.txt`, `protokoll-broki.mjs`, `aktiv.backup.json`

## Nächstes Thema (neue Session): Wissen für die Agenten im Sales Agentic Workshop
- Ziel: gemeinsam prüfen, welches Wissen die Agenten (Sales, BPM, Business Consultant) bekommen sollen.
- Zu klären: Rolle je Agent (was soll er wissen, was nicht); Ablageort (Wissensdatei je Agent, Hintergrundwissen des Workshops, verdichtetes Material); Größe (alles landet bei jeder Frage im Prompt, Wissensdatei nur beim gefragten Agenten).
- Regel: Keine Namen aus eingereichtem Material bei den Agenten. Auffällig: Der Vertriebsprofi nannte viele Personennamen (Paul Weber, Markus Peske u. a.) → Quelle prüfen (Wissensdatei oder Hintergrundwissen) und bereinigen.
- Material des Users in der Workshop-Ansicht unter „Material" oder aus einem Ordner einlesen; Material vorher bereithalten.
- Start in der neuen Session: „Lies NOTES.md und mach weiter."

## GEPARKT (Stand 19.11.2026): Wissen für die Agenten – Weiterarbeit 20.11. um 9:00
Analyse ist gemacht, noch nichts an Dateien geändert. Ergebnis in Kürze:
- **Drei Schichten:** (1) Workshop-Kontext/Briefing je Meeting (ca. 8–12 k Zeichen, geht bei jeder Frage mit; hier gehört das Vorbereitungsmaterial hin: Ist-Prozess, Problemübersicht, Praxisfälle, Kennzahlen), (2) Wissensdatei je Agent (12–20 k Zeichen, nur beim gefragten Agenten), (3) Nachschlagewerk (Recherche-Datei, Tool-Matrix) nicht laden, sondern auf die Agenten verteilen. Gesamtbudget Wissen ca. 60 k Zeichen.
- **Agenten-Zuschnitt (Vorschlag, noch offen):** Sales Professional, BPM Specialist, dritter Agent = KI-Berater Technik + Wirtschaft inkl. Rolle „Kritischer Prüfer“ (Agenda nennt Prozessbild / KI-Spezialist / Kritischer Prüfer).
- **Neu zu schreiben:** Wissensdatei Agent 3 (Technik-Katalog mit Aufwand S/M/L, BWL-Raster Nutzen×Aufwand×Datenreife×Risiko, Prüfliste). **Vom User zu liefern:** Seite „Was enthält Dynamics heute wirklich“ (Antonio/Engineering), Eckzahlen (Verkäufer, Opportunities, Abschlussquote, Zyklus, Stundensatz-Spanne), Vorbereitungsmaterial ohne Namen.
- **Bereinigen:** Verhaltensregeln aus den Wissensdateien in die Agent-Beschreibung (kollidieren mit dem Prompt: dort 1–3/max. 6 Sätze); `Brodos-Abteilungen-und-Leitung.md` nur als Landkarte ohne Namen (Quelle von Paul Weber, Markus Peske); `01_Kontext` + `Systemlandschaft` zusammenführen, Personentabelle raus; Recherche-Abschnitt 5 (alte Agenda 09:00–17:30) raus; Widerspruch Felix CIO vs. CDO klären.
- **Test statt Schätzen:** ca. 25 Fragen je Agenda-Block durch die Agenten laufen lassen, Lücken ergänzen, Überflüssiges kürzen, Namen-Check.
- Offene Entscheidung: Zuschnitt der drei Agenten (siehe oben).

## ERLEDIGT (20.11.2026): Freihand-Modus (Merlin hört ohne Klick)
Admin → Erweitert → Freihand-Modus (je Gerät, Standard aus). Merlin reagiert nur auf Sätze, die mit „Merlin“ beginnen; Rückfrage bei ähnlichem Namen und bei heiklen Aktionen; „Ja?“-Fenster; neu per Stimme: To-do abhaken, ändern, löschen (mit Rückfrage). Der Protokollant ignoriert Befehle an Merlin, solange der Modus läuft. Details: `docs/uebergabe/freihand.md`. Mit einem Test-Chrome mit künstlichem Mikrofon Ende zu Ende geprüft. **Noch nicht geprüft:** echtes Raummikrofon, Spracherkennung (Voxtral) mit echten Sätzen, 7–10 Leute im Raum.

## ERLEDIGT (20.11.2026): Führung lockerer
Bühne im App-Rahmen: Hintergrund weich gezeichnet, Merlin gleitet nach links, Mund wechselt beim Sprechen (zu: `merlin-mund-zu.jpg`, auf: `merlin-hoert.webp`), rechts runde Bubbles, kein Text, Musik `public/audio/fuehrung.mp3` (nur lokal, nicht im Git, Rechte klären; Lautstärke im Admin). Details: `docs/uebergabe/fuehrung.md`. Im Browser-Panel geprüft (alle 7 Stationen, Abbruch per Klick und Esc, Musik an/aus). **Screenshots:** die eigenen Bilder des Users (`1.png` bis `5b.png`) sind eingebaut. Auffällig: `2.png` zeigt echte Namen in Entscheidungen und To-dos, `3b.png` zeigt "[Mock]" in den Antworten. **Offen:** Klang und Takt am Workshop-Laptop und Beamer, Hochformat-Fenster (Bubbles überlappen dort Merlin).

## ERLEDIGT (19.11.2026): „Merlin führt durch die App“
Auf Zuruf („Merlin, erklär uns die App“) oder per Knopf auf dem Startscreen: Merlin spricht 7 Stationen, blendet Bildschirmfotos ein, Navigation leuchtet, Klick auf Merlin/Esc bricht ab. Nicht bei laufender Aufnahme und nicht in Assistent/Agenten/Pinnwand (ein offenes, pausiertes Meeting stört nicht). Details: `docs/uebergabe/fuehrung.md`. Im Browser-Panel mit Mock-Daten geprüft (Ablauf, Abbruch, Start aus Admin, Ablehnung bei offenem Meeting). **Noch nicht geprüft:** Klang/Tempo mit der echten Merlin-Stimme am Workshop-Laptop und Beamer.
Offen: Der User sprach von „zwei weiteren Projekten“, genannt wurde nur dieses. Zweites noch nachfragen.

## Nächster konkreter Schritt
1. Server neu starten (`npm.cmd start`), Strg+F5, Agenten-Seite mit echtem Mikrofon testen (Klick → sprechen → Klick) und prüfen, dass die Frage nicht im Transkript/Protokoll auftaucht.
2. Danach: Broki-Prompt-Regel „NEUES TO-DO" generisch einsetzen (Okay des Users) und Testlauf wiederholen.

## ERLEDIGT (21.11.2026): Testdaten aufgeräumt
Testmeetings und -workshops gelöscht (Backup außerhalb des Repos: `..\BroKI-Backup-data-2026-11-21`). Übrig: der leere Workshop „Sales Agentic Workshop“. Kein Meeting aktiv.
