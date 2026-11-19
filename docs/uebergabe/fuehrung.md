# Führung durch die App (Merlin)

Merlin erklärt auf Zuruf in etwa zwei Minuten, was die App kann. Er bleibt auf dem Startscreen, spricht (Browser-Stimme aus Admin → Erweitert) und blendet zu jeder Station ein Bildschirmfoto ein. Die obere Navigation leuchtet gelb, wo es passt.

## Bedienung
- **Starten:** sagen „Merlin, erklär uns die App“ (auch „Führung durch die App“, „Rundgang“, „Zeig uns die App“) oder auf dem Startscreen unten auf „Führung durch die App“ klicken.
- **Nur ohne geöffnetes Meeting.** Mit offenem Meeting oder laufender Aufnahme lehnt Merlin freundlich ab. Aus einem anderen Bereich (z. B. Admin) geht Merlin zuerst zum Startscreen.
- **Unterbrechen:** Klick auf Merlin oder seine Sprechblase, „Führung beenden“, Esc oder ein Klick in die obere Navigation. Während Merlin spricht ist das Mikrofon stumm, ein Zuruf wirkt deshalb nicht.
- **Ende:** Merlin fragt wieder „Meeting oder Workshop?“, die zwei Knöpfe sind offen.

## Texte und Stationen ändern
`public/js/fuehrung-stationen.js`: je Station `text` (wird gesprochen und angezeigt), `bild`, `titel`, `licht` (Navigationspunkte). Ohne `bild` bleibt Merlin allein in der Mitte. Texte satzweise schreiben, weil das Vorlesen satzweise läuft.

## Bilder neu erzeugen (nach Änderungen an der Oberfläche)
```powershell
node scripts/fuehrung-bilder.mjs
```
Das Skript kopiert die App in einen Wegwerf-Ordner, startet sie dort im Mock-Modus mit Beispieldaten und fotografiert die Bereiche mit Chrome oder Edge (unsichtbar). Echte Daten und `.env` bleiben unberührt. Ergebnis: `public/img/fuehrung/*.png`. Anderer Browser: Umgebungsvariable `CHROME_PFAD`.

## Technik
- Server (`src/merlin.ts`): Aktion `fuehrung` (feste Regel `FUEHRUNG`, auch im KI-Prompt), Ablehnung bei offenem Meeting in `aufloesen`.
- Ablauf (`public/js/merlin.js`): `starteFuehrung` / `beendeFuehrung`, Vorlesen satzweise (`sprichBis`). Ist das Vorlesen vom Browser gesperrt, bleibt der Text so lange stehen, wie man ihn liest.
- Anzeige (`public/js/uebersicht.js`, `public/uebersicht.html`): Bild, Fortschrittspunkte, „Führung beenden“. Navigation leuchtet über `licht()` in `public/js/shell.js`.
- Tests: `tests/merlin.test.ts` (Sprachbefehl).
