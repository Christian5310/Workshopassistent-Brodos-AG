# Entscheidungen

| Thema | Entscheidung | Warum |
|---|---|---|
| Transkription | Mistral Voxtral (`voxtral-mini-transcribe-3-0`) als Standard, Whisper lokal umschaltbar | Whisper Turbo braucht ohne Grafikkarte 24–27 s je 30-s-Abschnitt bei schwacher Qualität; Mistral < 1 s |
| Transkription über Broki | als vierte Option eingebaut (18.11.), Test mit echtem Audio steht aus | Wunsch: alle KI-Dienste über Broki |
| Logik | Broki, Basismodell `claude-haiku-5-5`, Protokoll über Broki-Modell `broki-protokoll` | Test: 36/36 Punkte, ~3 s, ca. 0,06 $/h. GPT-6 luna war unzuverlässig |
| Fallback Logik | Mistral Medium (36/36, schneller, ca. 0,40 $/h) | `LLM_*` in `.env` auskommentieren |
| Prompt Transkriptionsassistent | wird in Broki gepflegt; App schickt nur technische Vorgaben in der Nutzer-Nachricht | Open WebUI wendet den Modell-Prompt mit eigener System-Nachricht nicht zuverlässig an |
| Vorschläge | Broki-Prompt bleibt, nicht auf mehr Vorschläge trimmen | Frühere Version erzeugte ständig Vorschläge |
| Protokoll-Format | KI liefert nur Änderungen, nur laufender Punkt vollständig | Großes Protokoll: 2–4 s statt ~20 s je Abschnitt |
| Takt | je Meeting gespeichert; Meeting 30 s, Workshop 45 s | |
| To-do-Ablage | Agenda = Ablage mit Ordner; Häkchen legt ab; „Ohne Agendapunkt"; Drag & Drop | Liste im Hauptfenster bleibt kurz |
| Speicher | JSON-Dateien, keine Datenbank | Ein Laptop, ein Tag |
| Aktivierungswort | „Merlin" für Sprachbefehle im Abschnitt | |
| Workshop-Aufbau | Laptop 1 Server + Mikro, Laptop 2 nur Anzeige | siehe `workshop-aufbau.md` |
| Lokal hosten | Transkription nicht auf einem Server hosten, nur lokal am PC (Whisper) als Option | Vorgabe Christian |
