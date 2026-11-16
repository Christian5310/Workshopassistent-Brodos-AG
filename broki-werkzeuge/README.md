# Broki-Werkzeuge

Werkzeuge (Tools) für Broki (Open WebUI). Einrichten unter **Arbeitsbereich → Werkzeuge → +**, Code einfügen, speichern.
Danach im Modell unter **Werkzeuge** anhaken.

## interview_zusammenfassung.py

Zeigt die bestätigte Zusammenfassung eines Vorab-Interviews im BroKI-Design direkt im Chat.

- **In neuem Tab öffnen** → Strg+P → „Als PDF speichern“ (Hintergrundgrafiken an)
- **Markdown herunterladen** → `.md`-Datei für SharePoint und das Workshop-Material der BroKI-App

Gleicher Mechanismus wie das Werkzeug „Meta Ads Report“ (HTML-Antwort im Chat). Keine Zusatzbibliotheken nötig.
Einstellbar über Valves: `workshop` (Name im Kopf), `datum`.

Der Interviewer-Prompt ruft das Werkzeug als `interview_zusammenfassung_erstellen` auf.
Der Prompt selbst liegt nicht im Repo, weil er Teilnehmernamen enthält.
