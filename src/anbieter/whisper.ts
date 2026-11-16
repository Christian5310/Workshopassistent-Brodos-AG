import { config } from "../config.ts";
import { einstellungen } from "../einstellungen.ts";
import { store } from "../store.ts";
import type { TranskriptQuelle } from "./schnittstellen.ts";

const ENDUNG: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav" };

/**
 * Whisper erfindet bei Stille oder Rauschen gern Sätze, im Deutschen vor allem Untertitel-Floskeln.
 * Solche Zeilen werden verworfen; besteht ein Abschnitt nur daraus, gilt er als leer.
 */
const ERFUNDEN = [
  /untertitel (im auftrag|von|der|erstellt|by|:)/i,
  /amara\.org/i,
  /im auftrag des (zdf|ard|wdr|swr|br|ndr|mdr|hr)/i,
  /(vielen )?dank (fürs|für's|für das|furs) (zuschauen|zuhören)/i,
  /bis zum nächsten mal/i,
  /copyright/i,
  /www\.[a-z0-9-]+\.(de|com)/i,
  /^\s*(musik|applaus|\[.*\]|\(.*\)|\*.*\*)\s*$/i,
];
export function ohneErfundenes(text: string): string {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((satz) => satz.trim() && !ERFUNDEN.some((muster) => muster.test(satz)))
    .join(" ")
    .trim();
}

/**
 * Transkription mit einem lokalen Whisper-Dienst (lokal/whisper_server.py, faster-whisper, MIT-Lizenz).
 * Spricht die OpenAI-kompatible Schnittstelle /v1/audio/transcriptions; das Audio verlässt den Rechner bzw. das Brodos-Netz nicht.
 * Keine Sprecher-Erkennung (Datenschutz, CLAUDE.md Abschnitt 8).
 */
export class WhisperTranskriptQuelle implements TranskriptQuelle {
  async transkribiere(audio: Buffer | null, _zweck: "protokoll" | "chat" | "befehl", mime = "audio/webm", extra: string[] = []): Promise<string | null> {
    if (!audio) return "";
    const typ = mime.split(";")[0]!.trim();
    const formular = new FormData();
    formular.set("model", config.stt.modell);
    formular.set("language", "de");
    formular.set("response_format", "json");
    // Whisper kennt kein context_bias: Fachbegriffe gehen als kurzer Hinweistext mit (begrenzt, sonst ignoriert Whisper ihn)
    const begriffe = [...new Set([einstellungen.aktivierungswort, ...extra, ...store.daten.begriffe.split(/[,\n]/).map((b) => b.trim()).filter(Boolean)])];
    let hinweis = "";
    for (const b of begriffe) if ((hinweis + b).length < 600) hinweis += (hinweis ? ", " : "") + b;
    if (hinweis) formular.set("prompt", `Besprechung bei Brodos. Begriffe: ${hinweis}.`);
    formular.set("file", new Blob([new Uint8Array(audio)], { type: typ }), `abschnitt.${ENDUNG[typ] ?? "webm"}`);

    const antwort = await fetch(`${config.stt.basisUrl}/v1/audio/transcriptions`, {
      method: "POST",
      body: formular,
      signal: AbortSignal.timeout(120_000), // lokal auf dem Prozessor kann ein Abschnitt dauern
    });
    if (!antwort.ok) throw new Error(`Lokale Transkription (Whisper): HTTP ${antwort.status} ${(await antwort.text()).slice(0, 300)}`);
    const daten = (await antwort.json()) as { text?: string };
    return ohneErfundenes(daten.text ?? "");
  }
}
