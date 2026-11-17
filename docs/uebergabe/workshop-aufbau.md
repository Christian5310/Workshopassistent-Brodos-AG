# Workshop-Aufbau: 2 Laptops, Konferenzmikro, 2 Beamer

## Aufbau

| | Laptop 1 (Moderation) | Laptop 2 (Anzeige) |
|---|---|---|
| Läuft | Server (`npm.cmd start`), Browser mit Meeting Assistent | nur Browser |
| Mikro | Konferenzmikro per USB | keins |
| Beamer | Beamer 1: Meeting Assistent (To-dos) | Beamer 2: Agenten |
| Adresse | `http://localhost:3000` | `http://<IP von Laptop 1>:3000` |

Laptop 2 nimmt kein Audio auf: Browser erlauben das Mikrofon nur über `localhost` oder https.

## Einrichten (Laptop 1)

1. In `.env` `HOST=0.0.0.0` eintragen, dann `npm.cmd start`.
2. IP herausfinden: `ipconfig` → IPv4-Adresse (WLAN/LAN).
3. Windows-Firewall: beim ersten Start „Zugriff zulassen" für Node.js (privates Netz). Sonst IT fragen.
4. Energiesparen aus, Bildschirmsperre aus, Netzteil dran, LAN statt WLAN wenn möglich.
5. Im Browser Mikrofon = Konferenzmikro wählen, Pegel in der Regie prüfen.

## Einrichten (Laptop 2)

1. Gleiches Netz wie Laptop 1.
2. Browser: `http://<IP>:3000` → Bereich Agenten, Präsentationsmodus (Vollbild-Knopf).

## Notfallplan

| Problem | Lösung |
|---|---|
| Broki antwortet nicht / HTTP 403 | `LLM_*`-Zeilen in `.env` auskommentieren, Server neu starten → Mistral Medium übernimmt |
| Mistral-Transkription fällt aus | Admin → Erweitert → Transkription auf Whisper (nur wenn Whisper-Dienst läuft; langsam) |
| Abschnitte stauen sich (Regie → Diagnose) | Takt im Admin beim Meeting auf 60 s |
| Laptop 2 erreicht Laptop 1 nicht | Firewall/IP prüfen; sonst Agenten auf Laptop 1 im zweiten Fenster |
| Alles fällt aus | Plan B: Broki-Chat direkt nutzen, eine Person schreibt mit |
