# Führung durch die App (Merlin)

Merlin erklärt auf Zuruf in etwa zwei Minuten, was die App kann. Der Hintergrund wird weich gezeichnet, Merlin gleitet von der Mitte nach links, rechts fahren je Station runde Bubbles mit Screenshots herein. Es gibt keinen Text: Merlin spricht (Browser-Stimme aus Admin → Erweitert), beim Sprechen bewegt sich sein Mund. Dazu leise Hintergrundmusik.

## Bedienung
- **Starten:** sagen „Merlin, erklär uns die App“ (auch „Führung durch die App“, „Rundgang“, „Zeig uns die App“) oder auf dem Startscreen unten auf „Führung durch die App“ klicken.
- **Nicht mitten im Meeting:** Bei laufender Aufnahme und in Assistent, Agenten und Pinnwand lehnt Merlin freundlich ab. Ein offenes, aber pausiertes Meeting stört nicht. Aus anderen Bereichen (z. B. Admin) geht Merlin zuerst zum Startscreen.
- **Unterbrechen:** Klick auf Merlin, „Führung beenden“ unten, Esc. Während Merlin spricht ist das Mikrofon stumm, ein Zuruf wirkt deshalb nicht. Auch das freie Zuhören (Freihand-Modus) pausiert während der Führung und noch kurz danach.
- **Ende:** Merlin fragt wieder „Meeting oder Workshop?“, die zwei Knöpfe sind offen.

## Texte, Bilder, Bubbles ändern
`public/js/fuehrung-stationen.js`: je Station `text` und `bilder`. Pro Bubble: `datei`, `x`/`y` (Mitte in Prozent der Bühne), `groesse` (in vmin), `von` (rechts/links/oben/unten), `nach` (Verzögerung in ms), `fokus`/`zoom` für breite Screenshots. Ohne `bilder` bleibt Merlin allein in der Mitte. Die Beschreibung steht am Dateianfang.

**Screenshots:** liegen in `public/img/fuehrung/` (`1.png`, `6.png`, `7.png`, `2_aufnahme.png`, `2b.png`, `3.png`, `3b.png`, `4.png`, `4b.png`, `5.png`, `5b.png`: Zahl = Station, b = zweite Bubble) und sind im Drehbuch zugeordnet. Kreise schneiden die Ecken ab. Bei nicht quadratischen Bildern bestimmen `fokus` (Mittelpunkt in Prozent) und `zoom` den Ausschnitt, `passt: true` zeigt das ganze Bild mit hellem Rand. Mehrere Bubbles je Station sind möglich (große und kleine, versetzt über `nach`). Neue Bilder am besten quadratisch, ab etwa 1000 Pixel, Wichtiges in der Mitte.

## Merlins Gesicht
Zwei Bilder wechseln beim Sprechen: `public/img/merlin-mund-zu.jpg` und `public/img/merlin-hoert.webp` (Mund offen). Der Mund folgt dem Text: Der Satz wird in Wörter und Silben zerlegt, je Silbe geht der Mund auf und zu, zwischen Wörtern und an Satzzeichen bleibt er zu. Er startet erst, wenn die Stimme wirklich anfängt. Meldet die Stimme jedes Wort (die Windows-Stimmen tun das), richtet sich der Mund bei jedem Wort neu aus. Echte Lippen-Synchronität gibt die Browser-Stimme nicht her.

**Stimme:** Browser laden die Stimmenliste erst beim ersten Zugriff. Merlin lädt sie jetzt beim Start der App vor und wartet beim Sprechen darauf, sonst sprach der erste Satz mit der Standardstimme des Geräts.

## Hintergrundmusik
- Datei: `public/audio/fuehrung.mp3` (liegt nur lokal und ist per `.gitignore` aus Git heraus, weil die Nutzungsrechte noch zu klären sind). Auf einem zweiten Laptop dort selbst ablegen. Fehlt die Datei, läuft die Führung ohne Musik.
- Lautstärke: Admin → Erweitert → Führung durch die App (je Gerät, 0 = aus). Unter Merlins Stimme wird sie automatisch leiser, Ein- und Ausblenden sind weich.
- Der Beamer-Ton muss am Laptop hängen.

## Technik
- Server (`src/merlin.ts`): Aktion `fuehrung` (feste Regel `FUEHRUNG`, auch in der KI-Liste), Ablehnung bei laufender Aufnahme in `aufloesen`.
- Ablauf (`public/js/merlin.js`): `starteFuehrung` / `beendeFuehrung`, Vorlesen satzweise (`sprichBis`), meldet jede Station über den Beobachter-Kanal `fuehrung`.
- Bühne (`public/js/fuehrung-buehne.js`, Markup in `public/app.html`, Styles am Ende von `brodos.css`): Bubbles, Mund, Musik.
- Tests: `tests/merlin.test.ts` (Sprachbefehl).

## Tagesablauf-Ansage (Workshop-Start)
Auf „Merlin, wie ist der Tagesablauf?“ (auch „heutiger Workshop“, „Was machen wir heute?“, „Worum geht es heute?“) liest Merlin einen festen Text vor, auch im Freihand-Modus ungekürzt. Der Text steht in `src/merlin.ts` (`TAGESABLAUF_TEXT`), die Stichwörter in `TAGESABLAUF`. Änderungen brauchen einen Neustart des Servers.
