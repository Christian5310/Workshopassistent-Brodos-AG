# Pinnwand: HTML-Seiten und eigene Notizen

Stand: 23.11.2026

## Was die Pinnwand zeigt
Jedes Material mit gesetztem **Pin** (Einrichten → Material) hängt als Karte an der Pinnwand. Dazu zwei neue Arten:

| Art | Wie sie auf die Wand kommt | Klick öffnet |
|---|---|---|
| Datei (PDF, Word, Excel, Text) | Einrichten → Material → hochladen, Pin anhaken | Fenster mit Kurzfassung, Zusammenfassung, Merlin-Fragen |
| **HTML-Seite** | Einrichten → Material → `.html` oder `.htm` hochladen (hängt automatisch an der Wand) | **die Seite selbst** in einem eigenen Fenster |
| **Eigene Notiz** | Pinnwand → **Notiz hinzufügen** (Titel und Text) | Fenster mit dem Text, dort **Bearbeiten** und **Löschen** |

## HTML-Seiten
- Ablage wie bei anderen Dateien: `data/workshops/dateien/<workshop>/<material>.html`, bis 25 MB.
- Aus der Seite wird der sichtbare Text gelesen (ohne Skripte und Stile), damit die KI eine Kurzfassung schreiben kann und Merlin und die Agenten die Seite als Material kennen. Hat die Seite keinen Text, steht auf der Karte „HTML-Seite. Ein Klick öffnet sie in einem eigenen Fenster.“
- **Sicherheit:** Der Server liefert die Seite mit `Content-Security-Policy: sandbox allow-scripts …` aus. Skripte der Seite laufen (Prototypen, Dashboards gehen), haben aber keinen Zugriff auf die App, ihre Schnittstellen, den Browserspeicher oder die Schlüssel. Externe Bilder und Skripte der Seite lädt der Browser normal nach.
- Nur Seiten hochladen, denen ihr vertraut. Die Sandbox ist ein Schutz, kein Freibrief.

## Eigene Notizen
- Titel bis 120, Text bis 20.000 Zeichen. Gliedern geht mit `## Überschrift` und `- Stichpunkt`.
- Die Kurzfassung ist der Anfang des Textes (kein KI-Aufruf, keine Wartezeit). Bitte ohne Namen schreiben, wie beim übrigen Material.
- Notizen erscheinen auch in der Materialliste unter Einrichten und zählen als Material für Merlin und die Agenten.
- Bearbeiten und Löschen gehen im Notiz-Fenster (Klick auf die Karte).

## Technik
- Server: `src/server.ts` (`/api/workshops/:id/datei`, `…/material/:mid/datei`, `…/notiz`, `…/notiz/:mid`), `src/dateien.ts` (`htmlText`), `src/workshops.ts` (Feld `notiz`).
- Oberfläche: `public/js/pinnwand.js`, `public/pinnwand.html` (Dialog), `public/js/pin.js`, `public/pin.html`, `public/js/workshops.js`.
- Tests: `tests/dateien.test.ts` (HTML-Text).
