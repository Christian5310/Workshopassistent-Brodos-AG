# Freihand-Modus: Merlin hört ohne Klick auf seinen Namen

Stand 20.11.2026. Ein/Aus in **Admin → Erweitert → Freihand-Modus**, gilt je Gerät und sofort (nicht mit „Speichern“). Standard: aus.

## Rollen
- **Merlin** (mit Namen): navigiert, öffnet Agenten, startet/pausiert die Aufnahme, legt To-dos an, ändert sie, hakt sie ab, löscht sie (mit Rückfrage), fragt die Agenten, beantwortet Fragen aus dem Material. Er steht über Protokollant und Agenten.
- **Protokollant** (ohne Namen): hört nur To-dos, Entscheidungen, offene Fragen und Notizen heraus. Im Freihand-Modus führt er keine Befehle an „Merlin“ mehr aus (`src/freihand.ts`, `sprachbefehle()` in `src/anbieter/llm.ts`). Sätze mit „Merlin“ dürfen im Transkript stehen bleiben.
- **Drei Experten:** antworten, wenn Merlin die Frage weiterreicht.
- Ist der Freihand-Modus aus (oder meldet sich der Browser 90 s nicht mehr), gilt automatisch wieder das alte Verhalten über das Transkript.

## Ablauf eines Satzes
1. Browser (`public/js/freihand.js`, `freihand-kern.js`): Mikrofon dauernd offen, Sprechpausen-Erkennung schneidet kurze Sätze (höchstens 10 s) ab und macht daraus eine kleine WAV-Datei im Arbeitsspeicher. Längere Redebeiträge werden verworfen.
2. Server (`/api/merlin/zuhoeren`): Spracherkennung wie sonst (Voxtral usw.), danach `deuteZuruf` in `src/merlin.ts`. Das Audio wird nie gespeichert.
3. Nur Sätze, die mit dem Stichwort beginnen (höchstens zwei Füllwörter davor, z. B. „Hey Merlin, …“), zählen. Mitten im Satz („Wir haben das mit Merlin besprochen“, „…in Berlin“) passiert nichts.

## Fehlauslösungen
| Fall | Merlin |
|---|---|
| Kein Stichwort am Satzanfang | ignoriert, nichts sichtbar |
| Stichwort eindeutig, Befehl klar | führt aus, kurze Rückmeldung (höchstens etwa zwei Sätze, voller Text in der Blase) |
| Nur „Merlin“ | sagt „Ja?“, zittert wie beim Zuhören per Klick, wartet 7 s. In dieser Zeit genügt ein klarer Befehl ohne Namen, Gerede wird ignoriert. |
| Name nur ähnlich („Marlin“, „Berlin“) | fragt „Meintest du mich? Ich habe verstanden: …“, nur wenn der Rest ein klarer Befehl ist. Ja per Stimme oder Klick. |
| Aufnahme starten, Meeting schließen, To-do löschen | fragt immer nach (Ja/Nein) |
| Auf eine Rückfrage weiterreden, „Nein“, „Ignoriere das“, „Stopp“ | gilt als Nein. Nach 10 s ohne Antwort verfällt die Frage. |
| „Merlin, ignoriere das“ | „Gut.“ |

Während Merlin spricht oder per Klick zuhört, ist das Freihand-Zuhören und das Protokoll stumm (plus 0,7 s Nachlauf). Während der Führung hört Merlin nicht zu.

## Einrichten im Raum
- Raummikrofon (Konferenz-Lautsprecher) in die Tischmitte. Laptop-Mikrofon reicht bei 7–10 Leuten nicht.
- Admin → Erweitert → Freihand-Modus einschalten, Mikrofon im Browser erlauben (einmalig). Der Balken beim Mikrofon-Test zeigt, was Merlin hört, und wird gelb bei erkanntem Sprechen. Empfindlichkeit anpassen.
- Merlin hört nur auf dem Gerät, auf dem es eingeschaltet wurde. Auf einem zweiten Laptop nicht einschalten, sonst gibt es doppelte Befehle.
- Hörbares „Merlin hört zu“: grüner Punkt an der Merlin-Bubble, grüne Mikrofon-Schaltfläche auf dem Startscreen.
- Stimmt Chrome die Sprachausgabe erst nach einem Klick frei, genügt ein Klick irgendwo auf der Seite.
- Rückfall: Klick auf Merlin wie bisher.

## Offen
- Broki-Prompt des Protokollanten (`docs/uebergabe/broki-protokoll-prompt.md`) nennt ihn noch „Merlin“ und gibt Sprachbefehlen Vorrang. Die App überschreibt das im Freihand-Modus per Zusatz-Anweisung. Den Broki-Prompt später mit Rücksprache anpassen.
- Mit echtem Mikrofon im Raum testen (Pegel, Fehlauslösungen, Sprachausgabe nach Reload).
