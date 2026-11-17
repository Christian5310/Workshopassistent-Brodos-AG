# Tests

## Automatisch

```
npm.cmd test
npm.cmd run typecheck
```

- `tests/delta.test.ts`: Arbeitsstand für die KI und Umwandlung der Änderungs-Antwort.
- `tests/json-reparatur.test.ts`: Reparatur kaputter JSON-Antworten.

Neue Tests als `tests/<name>.test.ts` mit `node:test` anlegen.

## Modelltest (Qualität der To-do-Erkennung)

Bewertet wurden 4 Szenarien × 3 Durchläufe (Workshop mit Hörfehlern, Smalltalk ohne To-dos, vager Wunsch, klare Aufgaben mit Befehl).
Ergebnis 17.11. mit Änderungs-Format über Broki: 36/36. Bei Modell- oder Prompt-Wechsel wiederholen: Claude bitten, den Modelltest neu aufzusetzen.

## Manuell vor dem Workshop

1. App starten, Einverständnis bestätigen, Meeting öffnen.
2. Agendapunkt anklicken, Aufnahme starten. Nach dem ersten Abschnitt erscheint rot „Transkript ist da …".
3. Satz sagen: „Anna übernimmt bis Freitag den CRM-Export." → To-do erscheint (Owner, Frist).
4. „Merlin, lösche das To-do CRM-Export." → To-do weg; „Rückgängig" holt es zurück.
5. Häkchen → To-do liegt im Ordner beim Agendapunkt; dort bearbeiten, erledigt setzen, zurückholen.
6. To-do auf einen anderen Agendapunkt ziehen.
7. Regie → Diagnose: Dauer je Abschnitt, keine wartenden Abschnitte.
8. Laptop 2 im Browser `http://<IP>:3000` → Agenten-Ansicht aktualisiert sich live.
9. Meeting schließen → im Archiv, Download funktioniert, KI-Zusammenfassung erstellen.
