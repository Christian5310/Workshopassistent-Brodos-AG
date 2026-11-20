# Führung durch die App (Merlin)

Merlin erklärt auf Zuruf in etwa zwei Minuten, was die App kann. Der Hintergrund wird weich gezeichnet, Merlin gleitet von der Mitte nach links, rechts fahren je Station runde Bubbles mit Screenshots herein. Es gibt keinen Text: Merlin spricht (Browser-Stimme aus Admin → Erweitert), beim Sprechen bewegt sich sein Mund. Dazu leise Hintergrundmusik.

## Bedienung
- **Starten:** sagen „Merlin, erklär uns die App“ (auch „Führung durch die App“, „Rundgang“, „Zeig uns die App“) oder auf dem Startscreen unten auf „Führung durch die App“ klicken.
- **Nicht mitten im Meeting:** Bei laufender Aufnahme und in Assistent, Agenten und Pinnwand lehnt Merlin freundlich ab. Ein offenes, aber pausiertes Meeting stört nicht. Aus anderen Bereichen (z. B. Admin) geht Merlin zuerst zum Startscreen.
- **Unterbrechen:** Klick auf Merlin, „Führung beenden“ unten, Esc. Während Merlin spricht ist das Mikrofon stumm, ein Zuruf wirkt deshalb nicht. Auch das freie Zuhören (Freihand-Modus) pausiert während der Führung und noch kurz danach.
- **Ende:** Merlin fragt wieder „Meeting oder Workshop?“, die zwei Knöpfe sind offen.

## Texte, Bilder, Bubbles ändern
`public/js/fuehrung-stationen.js`: je Station `text` und `bilder`. Pro Bubble: `datei`, `x`/`y` (Mitte in Prozent der Bühne), `groesse` (in vmin), `von` (rechts/links/oben/unten), `nach` (Verzögerung in ms), `fokus`/`zoom` für breite Screenshots. Ohne `bilder` bleibt Merlin allein in der Mitte. Die Beschreibung steht am Dateianfang.

**Eigene Screenshots:** in `public/img/fuehrung/` ablegen und in der Station eintragen. Kreise schneiden die Ecken ab, deshalb das Wichtige in die Mitte setzen, am besten quadratige Ausschnitte (ab etwa 1000 Pixel). Mehrere Bubbles je Station sind möglich (große und kleine, versetzt über `nach`).

## Merlins Gesicht
Zwei Bilder wechseln beim Sprechen: `public/img/merlin-mund-zu.jpg` und `public/img/merlin-hoert.webp` (Mund offen). Wechsel im Takt von Silben mit zufälligen Pausen. Echte Lippen-Synchronität gibt die Browser-Stimme nicht her.

## Hintergrundmusik
- Datei: `public/audio/fuehrung.mp3` (liegt nur lokal und ist per `.gitignore` aus Git heraus, weil die Nutzungsrechte noch zu klären sind). Auf einem zweiten Laptop dort selbst ablegen. Fehlt die Datei, läuft die Führung ohne Musik.
- Lautstärke: Admin → Erweitert → Führung durch die App (je Gerät, 0 = aus). Unter Merlins Stimme wird sie automatisch leiser, Ein- und Ausblenden sind weich.
- Der Beamer-Ton muss am Laptop hängen.

## Platzhalter-Bilder erzeugen
```powershell
node scripts/fuehrung-bilder.mjs
```
Das Skript kopiert die App in einen Wegwerf-Ordner, startet sie dort im Mock-Modus mit Beispieldaten und fotografiert die Bereiche mit Chrome oder Edge. Echte Daten und `.env` bleiben unberührt. Ergebnis: `public/img/fuehrung/*.png`. Anderer Browser: Umgebungsvariable `CHROME_PFAD`.

## Technik
- Server (`src/merlin.ts`): Aktion `fuehrung` (feste Regel `FUEHRUNG`, auch in der KI-Liste), Ablehnung bei laufender Aufnahme in `aufloesen`.
- Ablauf (`public/js/merlin.js`): `starteFuehrung` / `beendeFuehrung`, Vorlesen satzweise (`sprichBis`), meldet jede Station über den Beobachter-Kanal `fuehrung`.
- Bühne (`public/js/fuehrung-buehne.js`, Markup in `public/app.html`, Styles am Ende von `brodos.css`): Bubbles, Mund, Musik.
- Tests: `tests/merlin.test.ts` (Sprachbefehl).
