import { config } from "../config.ts";
import type { TranskriptQuelle } from "./schnittstellen.ts";

const ENDUNG: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav" };

/**
 * Transkription über Broki (Open WebUI), Endpunkt /api/v1/audio/transcriptions.
 * Welches Modell dahinter läuft (z. B. gpt-transcribe), stellt Broki im Admin unter Einstellungen → Audio ein,
 * nicht die App. Adresse und Schlüssel sind dieselben wie beim Sprachmodell (LLM_BASE_URL, LLM_API_KEY).
 * Fachbegriffe kann die Schnittstelle nach bisherigem Stand nicht entgegennehmen.
 * Keine Sprecher-Erkennung (Datenschutz).
 */
export class BrokiTranskriptQuelle implements TranskriptQuelle {
  async transkribiere(audio: Buffer | null, _zweck: "protokoll" | "chat" | "befehl", mime = "audio/webm"): Promise<string | null> {
    if (!audio) return "";
    const typ = mime.split(";")[0]!.trim();
    const formular = new FormData();
    formular.set("file", new Blob([new Uint8Array(audio)], { type: typ }), `abschnitt.${ENDUNG[typ] ?? "webm"}`);
    formular.set("language", "de");

    const antwort = await fetch(`${config.stt.brokiUrl}${config.stt.brokiPfad}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.llm.schluessel}`, Accept: "application/json" },
      body: formular,
      signal: AbortSignal.timeout(60_000),
    });
    if (!antwort.ok) throw new Error(`Broki-Transkription: HTTP ${antwort.status} ${(await antwort.text()).slice(0, 300)}`);
    const daten = (await antwort.json()) as { text?: string };
    return (daten.text ?? "").trim();
  }
}
