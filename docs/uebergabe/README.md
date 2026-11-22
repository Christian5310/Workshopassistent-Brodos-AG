# Übergabe an die lokale Claude-Session

Stand 17.11.2026. Ab hier wird BroKI auf dem eigenen PC mit Claude Code weiterentwickelt und betrieben.

## Inhalt dieses Ordners

| Datei | Wofür |
|---|---|
| `CLAUDE.vorlage.md` | Vorlage für die `CLAUDE.md` im Projektordner. Claude Code liest sie bei jedem Start. |
| `entscheidungen.md` | Was entschieden ist und warum. Nicht ohne Rücksprache ändern. |
| `offene-punkte.md` | Was noch fehlt, nach Priorität bis zum Workshop am 26.11. |
| `tests.md` | Automatische Tests und manuelle Prüfliste vor dem Workshop. |
| `workshop-aufbau.md` | Technik im Raum: 2 Laptops, Konferenzmikro, 2 Beamer, Notfallplan. |
| `aufwaermspiel.md` | KI-Aufwärmspiel (6-3-5): Ablauf, Dateien, Prompt, Grenzen. |
| `workshop-vorbereitung-interviews.md` | Ältere Übergabe: Teilnehmer-Interviews über Broki. |

Weitere Doku: `README.md` (Bedienung, API), `docs/lokal-einrichten.md` (Whisper/Ollama), `docs/ideen-parkplatz.md`.

## Erste Schritte auf dem PC (Windows, PowerShell)

1. Projekt aktualisieren:
   ```
   cd C:\Users\<du>\Workshopassistent-Brodos-AG
   git pull
   npm.cmd install
   ```
2. Vorlage übernehmen (einmalig, die Datei bleibt lokal und geht nicht ins Repo):
   ```
   copy docs\uebergabe\CLAUDE.vorlage.md CLAUDE.md
   ```
   Eine vorhandene `CLAUDE.md` vorher sichern; interne Ergänzungen (Namen, Ansprechpartner) nur dort eintragen.
3. Prüfen: `npm.cmd test` (alle grün) und `npm.cmd run typecheck` (keine Ausgabe).
4. Claude Code im Projektordner starten: `claude`. Erste Nachricht z. B.: „Lies docs/uebergabe und sag mir, was als Nächstes ansteht.“

## Arbeitsweise (bewährt)

- Erst erklären, dann bauen: Bei neuen Funktionen fragt Claude vorher nach.
- Nach jeder Änderung: Test, Commit, Push, kurze Anleitung zum Aktualisieren (git pull, `npm.cmd start`, Strg+F5).
- Vor größeren Umbauten Sicherungs-Branch anlegen (Beispiel: `sicherung/vor-merlin-navigator`).
- Keine API-Schlüssel in Chat, Code oder Commits. Nur in `.env`.
