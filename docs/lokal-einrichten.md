# BroKI komplett lokal betreiben (ohne Cloud, ohne Lizenzkosten)

Stand 16.11.2026. Transkription und Sprachmodell laufen auf dem eigenen Rechner. Audio, Transkript und Protokoll verlassen ihn nicht.

| Baustein | Software | Lizenz |
|---|---|---|
| Transkription | Whisper über **faster-whisper** (`lokal/whisper_server.py`) | MIT (Modelle ebenfalls MIT) |
| Sprachmodell | **Ollama** mit einem Apache-2.0-Modell | Ollama: MIT · Modell: siehe unten |
| Python | python.org | PSF-Lizenz, kostenlos |

**Bewusst ohne Docker Desktop:** Docker Desktop ist für Unternehmen ab 250 Mitarbeitenden oder 10 Mio. $ Umsatz kostenpflichtig.

## Hardware (wichtig, vorher prüfen)

| Rechner | Was realistisch läuft |
|---|---|
| Grafikkarte (NVIDIA) mit ≥ 16 GB Speicher | Whisper `large-v3-turbo` + `mistral-small3.2` (24B): flüssig |
| Ohne Grafikkarte, ≥ 32 GB Arbeitsspeicher | Whisper `medium` + `mistral-nemo` (12B): geht, aber langsamer. Testen, ob ein Abschnitt in unter 30 s fertig ist |
| Ohne Grafikkarte, 16 GB Arbeitsspeicher | nur kleine Modelle (Whisper `small`, Sprachmodell ~8B), deutlich schwächere Qualität |

Faustregel Arbeitsspeicher: Sprachmodell (Download-Größe) + 2–4 GB für den Kontext + ~2 GB für Whisper + Windows.

## Modelle (alle Apache 2.0, keine Lizenzkosten)

| Ollama-Name | Größe | Einschätzung |
|---|---|---|
| `mistral-small3.2` | 24B, ~15 GB | **Standard.** Gutes Deutsch, zuverlässiges JSON. Braucht starke Hardware. |
| `mistral-nemo` | 12B, ~7 GB | Kompromiss für Rechner ohne Grafikkarte |
| `qwen3:8b` | 8B, ~5 GB | klein und schnell, Deutsch schwächer |

Lizenz vor dem Einsatz auf der Modellseite bei ollama.com prüfen. Llama- und Gemma-Modelle haben eigene Lizenzbedingungen (keine Kosten, aber Auflagen) und sind hier bewusst nicht aufgeführt. Es können inzwischen neuere Apache-2.0-Modelle verfügbar sein.

## Einrichtung (Windows)

1. **Ollama installieren:** Installer von ollama.com. Ollama läuft danach im Hintergrund (Symbol unten rechts).
2. **Modell laden** (einmalig, im Terminal):
   ```
   ollama pull mistral-small3.2
   ```
3. **Python installieren** (3.11 oder neuer) von python.org. Beim Installieren „Add python.exe to PATH" anhaken.
4. **Whisper-Dienst starten:** Doppelklick auf `lokal\start-whisper.cmd`.
   Beim ersten Start werden Pakete installiert und das Whisper-Modell heruntergeladen (einige Minuten). Fertig, wenn „Modell geladen" erscheint. Fenster offen lassen.
5. **`.env` im Projektordner anpassen:**
   ```
   MOCK_MODE=false
   STT_ANBIETER=whisper
   LLM_ANBIETER=ollama
   LLM_MODEL=mistral-small3.2
   ```
   Einen `MISTRAL_API_KEY` braucht es dann nicht mehr.
6. **App starten** wie gewohnt mit `npm.cmd start`. Im Terminal steht, ob Whisper und Ollama erreichbar sind und das Modell vorhanden ist. Dieselbe Prüfung gibt es in der App unter **Regie → KI-Dienste**.

### Kleinere Modelle für schwächere Rechner

- Whisper: vor dem Start `set WHISPER_MODELL=medium` (oder `small`) im Terminal, dann `lokal\start-whisper.cmd`.
- Sprachmodell: `ollama pull mistral-nemo` und in der `.env` `LLM_MODEL=mistral-nemo`.

### Wenn Downloads im Brodos-Netz gesperrt sind

- Whisper-Modelle kommen von huggingface.co. Ist das gesperrt: Modellordner (z. B. „faster-whisper-large-v3-turbo") auf einem anderen Rechner herunterladen, nach `lokal\modelle\` kopieren und `WHISPER_MODELL=lokal\modelle\<ordner>` setzen.
- Ollama-Modelle kommen von ollama.com. Gegebenenfalls die IT um Freigabe bitten.

## Zurück zur Cloud (Mistral)

In der `.env` `STT_ANBIETER` und `LLM_ANBIETER` entfernen (oder auf `mistral` / `openai` setzen) und `MISTRAL_API_KEY` eintragen. Beides lässt sich auch einzeln umstellen, z. B. nur die Transkription lokal.

## Zu beachten

- **Geschwindigkeit:** Die App schickt alle 30 s einen Abschnitt. Braucht der Rechner länger, stauen sich die Abschnitte. Im Whisper-Fenster steht pro Abschnitt die Dauer („transkribiert in … s"). Bei Bedarf kleineres Modell oder längeren Takt (Admin → Meetings) wählen.
- **Whisper erfindet bei Stille gelegentlich Sätze** (z. B. Untertitel-Floskeln). Die App filtert die bekannten Muster heraus und überspringt Stille.
- **Qualität vorher testen:** mit einer echten Aufnahme mit Fachbegriffen (Brodos, DaaS+, Dynamics …) und einem Vergleich zur Mistral-Version.
- **Einstellungen:** `LLM_KONTEXT` (Standard 16384) und `LLM_KONTEXT_MAX` (Standard 65536) steuern, wie viel Text das lokale Modell auf einmal sieht. Mehr braucht mehr Arbeitsspeicher. `LLM_ZEITLIMIT_SEKUNDEN` (Standard 300) begrenzt die Wartezeit.
