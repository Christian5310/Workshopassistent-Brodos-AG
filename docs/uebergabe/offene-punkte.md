# Offene Punkte (bis 26.11.2026)

## Heute (19.11.)

- [ ] **Merlin: weitere Sätze und Anweisungen.** Sätze sammeln, die im Workshop gesagt werden; nicht verstandene als feste Regeln in `src/merlin.ts` ergänzen.
- [ ] **Merlin bekommt Fachwissen für den Workshop.** Beispiel: Beim Eröffnen fragen „Wie sieht der Sales-Ist-Prozess aus?“ → Merlin ruft es aus dem Workshop-Wissen ab. Heute leitet die Bubble Fragen nur an die Agenten weiter; Konzept vor dem Bau abstimmen.
- [ ] Punkt 3: noch offen (von Christian).
- [x] **Fehler (behoben 19.11.):** Im Archiv gelöschte Workshop-Meetings bleiben unter „Bestehender Workshop“ sichtbar (Workshop-Datei mit Material bleibt liegen). Lösung abstimmen.
- [ ] **Idee:** Knopf in der App, der den Whisper-Dienst im Hintergrund startet (statt `lokal\start-whisper.cmd`). Erst nach Okay bauen.

## Vor dem Workshop – Muss

- [x] **Broki-Schlüssel:** neu, funktioniert seit 18.11. Protokoll und Agenten laufen über Broki-Staging.
- [ ] **Broki-Transkription:** Broki-Admins müssen unter Admin → Einstellungen → Audio die STT-Engine einrichten (heute 401 bei api.openai.com). Bis dahin Mistral.
- [ ] Für den Workshop-Tag in der `.env` `HOST=0.0.0.0` setzen (Laptop 2 als Anzeige).
- [ ] Echter Testlauf (30 Min internes Meeting) mit Konferenzmikro, Takt 45 s, Ablage im Live-Betrieb.
- [ ] Generalprobe im Raum am 25.11. mit beiden Laptops (siehe `workshop-aufbau.md`).
- [ ] Datenschutz/Betriebsrat: Hinweis und Einverständnis-Text final.
- [ ] Workshop in der App anlegen: Agenda, Teilnehmende, Material, Briefing übernehmen.

## Kann

- [ ] Knopf „Zurück in die Liste" direkt in der Zeile im Ablage-Fenster (heute über Bearbeiten).
- [ ] Takt-Auswahl auch auf der Workshop-Seite (heute fest 45 s).
- [ ] Ideen aus `docs/ideen-parkplatz.md` (Parkplatz-Bereich, Agendapunkt live ergänzen).
- [ ] Teams-Kopfhörer / Teams-Transkript als Quelle (zurückgestellt).
- [ ] SharePoint-Anbindung (nur geprüft, nichts gebaut).

## Nach dem Workshop

- [ ] Daten löschen (Regie) nach Versand des Protokolls.
- [ ] Briefing für 2027: Was wurde wirklich genutzt?
