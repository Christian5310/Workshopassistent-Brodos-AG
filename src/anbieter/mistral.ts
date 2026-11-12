import { config } from "../config.ts";
import { store } from "../store.ts";
import type { TranskriptQuelle } from "./schnittstellen.ts";

const ENDUNG: Record<string, string> = { "audio/webm": "webm", "audio/mp4": "m4a", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/wav": "wav" };

/**
 * Transkription mit Mistral Voxtral (Stapel-Endpunkt, EU).
 * Sprecher-Erkennung wird bewusst nicht angefordert (Datenschutz, CLAUDE.md Abschnitt 8).
 * Geprüft am 12.11.2026 gegen die API: webm/opus aus dem Browser wird akzeptiert,
 * "context_bias" (kommagetrennte Begriffe) verbessert Fachwörter wie "DaaS+".
 */
export class MistralTranskriptQuelle implements TranskriptQuelle {
  async transkribiere(audio: Buffer | null, _zweck: "protokoll" | "chat", mime = "audio/webm"): Promise<string | null> {
    if (!audio) return "";
    const typ = mime.split(";")[0]!.trim();
    const formular = new FormData();
    formular.set("model", config.stt.modell);
    formular.set("language", "de");
    const begriffe = store.daten.begriffe.split(/[,\n]/).map((b) => b.trim()).filter(Boolean);
    if (begriffe.length) formular.set("context_bias", begriffe.join(","));
    formular.set("file", new Blob([new Uint8Array(audio)], { type: typ }), `abschnitt.${ENDUNG[typ] ?? "webm"}`);

    const antwort = await fetch(`${config.stt.basisUrl}/v1/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.stt.schluessel}` },
      body: formular,
      signal: AbortSignal.timeout(30_000),
    });
    if (!antwort.ok) throw new Error(`Mistral-Transkription: HTTP ${antwort.status} ${(await antwort.text()).slice(0, 300)}`);
    const daten = (await antwort.json()) as { text?: string };
    return (daten.text ?? "").trim();
  }
}
