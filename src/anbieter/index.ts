import { config } from "../config.ts";
import { OpenAiKompatiblesSprachmodell } from "./llm.ts";
import { MistralTranskriptQuelle } from "./mistral.ts";
import { WhisperTranskriptQuelle } from "./whisper.ts";
import { BrokiTranskriptQuelle } from "./broki.ts";
import { MockSprachmodell, MockTranskriptQuelle } from "./mock.ts";
import type { Sprachmodell, TranskriptQuelle } from "./schnittstellen.ts";
import { einstellungen } from "../einstellungen.ts";

export type Transkription = "mistral" | "broki" | "whisper-large" | "whisper-turbo";
export const TRANSKRIPTION_NAME: Record<Transkription, string> = {
  mistral: "Mistral Voxtral (Cloud)",
  broki: "Broki (Cloud)",
  "whisper-large": "Whisper large-v3 (lokal)",
  "whisper-turbo": "Whisper Turbo (lokal)",
};

/**
 * Wählt bei jedem Abschnitt die Transkription, die im Admin eingestellt ist (Erweitert → Transkription).
 * So lassen sich Mistral und die lokalen Whisper-Modelle ohne Neustart vergleichen.
 */
class UmschaltbareTranskription implements TranskriptQuelle {
  readonly #quellen = {
    mistral: new MistralTranskriptQuelle(),
    broki: new BrokiTranskriptQuelle(),
    "whisper-large": new WhisperTranskriptQuelle(config.stt.whisperLarge),
    "whisper-turbo": new WhisperTranskriptQuelle(config.stt.whisperTurbo),
  };
  /** Zuletzt benutzt und wie lange es gedauert hat (für die Diagnose in der Regie) */
  letzte: { art: Transkription; sekunden: number } | null = null;

  async transkribiere(audio: Buffer | null, zweck: "protokoll" | "chat" | "befehl", mime?: string, begriffe?: string[]): Promise<string | null> {
    const art = einstellungen.transkription;
    if (art === "mistral" && !config.stt.schluessel) throw new Error("Für Mistral fehlt MISTRAL_API_KEY in der .env. Im Admin auf Whisper umstellen oder den Schlüssel eintragen.");
    if (art === "broki" && (!config.stt.brokiUrl || !config.llm.schluessel)) throw new Error("Für Broki fehlen LLM_BASE_URL oder LLM_API_KEY in der .env. Im Admin auf Mistral umstellen oder beides eintragen.");
    const beginn = Date.now();
    try {
      return await this.#quellen[art].transkribiere(audio, zweck, mime, begriffe);
    } finally {
      if (audio) this.letzte = { art, sekunden: (Date.now() - beginn) / 1000 };
    }
  }
}

/** Einzige Stelle, an der entschieden wird, welche Anbieter laufen. */
export function erstelleAnbieter(): { transkript: TranskriptQuelle; sprachmodell: Sprachmodell } {
  if (config.mock) return { transkript: new MockTranskriptQuelle(), sprachmodell: new MockSprachmodell() };
  // Schlüssel braucht nur, was in der Cloud läuft. Die Transkription prüft das je nach Einstellung beim Aufruf.
  if (config.llm.anbieter === "openai" && !config.llm.schluessel) throw new Error("MOCK_MODE=false, aber LLM_API_KEY fehlt in der .env (für das Sprachmodell). Für lokal: LLM_ANBIETER=ollama.");
  return { transkript: new UmschaltbareTranskription(), sprachmodell: new OpenAiKompatiblesSprachmodell() };
}

/** Beschreibung für Start-Ausgabe und Regie: was läuft wo? */
export function anbieterInfo(): string {
  if (config.mock) return "Mock (ohne KI)";
  const art = einstellungen.transkription;
  const modell = art === "whisper-large" ? config.stt.whisperLarge : art === "whisper-turbo" ? config.stt.whisperTurbo : art === "broki" ? `wie in Broki eingestellt (${config.stt.brokiUrl})` : config.stt.modell;
  const llm = config.llm.anbieter === "ollama" ? `Ollama lokal (${config.llm.modell}, ${config.llm.basisUrl})` : `${config.llm.modell} (${config.llm.basisUrl})`;
  return `Transkription: ${TRANSKRIPTION_NAME[art]}, Modell ${modell} · Sprachmodell: ${llm}`;
}

/** Prüft beim Start, ob die lokalen Dienste laufen und das Modell geladen ist; lädt das Sprachmodell vor. */
export async function pruefeLokal(): Promise<string[]> {
  const meldungen: string[] = [];
  if (config.mock) return meldungen;
  if (einstellungen.transkription.startsWith("whisper") || config.stt.anbieter === "whisper") {
    try {
      const r = await fetch(`${config.stt.whisperUrl}/health`, { signal: AbortSignal.timeout(3000) });
      const h = (await r.json()) as { geladen?: string[] };
      meldungen.push(r.ok ? `Whisper-Dienst erreichbar${h.geladen?.length ? `, geladen: ${h.geladen.join(", ")}` : ""}.` : `Whisper-Dienst antwortet mit HTTP ${r.status}.`);
    } catch {
      meldungen.push(`Whisper-Dienst NICHT erreichbar unter ${config.stt.whisperUrl}. Bitte lokal/start-whisper.cmd starten.`);
    }
  }
  if (einstellungen.transkription === "broki" && (!config.stt.brokiUrl || !config.llm.schluessel)) meldungen.push("Für die Broki-Transkription fehlen LLM_BASE_URL oder LLM_API_KEY in der .env.");
  if (einstellungen.transkription === "mistral" && !config.stt.schluessel) meldungen.push("MISTRAL_API_KEY ist in der .env NICHT gesetzt: Mistral-Transkription geht so nicht.");
  if (config.llm.anbieter === "ollama") {
    try {
      const r = await fetch(`${config.llm.basisUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
      const { models = [] } = (await r.json()) as { models?: { name: string }[] };
      const da = (name: string) => models.some((m) => m.name === name || m.name === `${name}:latest` || m.name.startsWith(`${name}:`));
      for (const name of new Set([config.llm.modell, config.llm.modellMerlin])) {
        meldungen.push(da(name) ? `Ollama-Modell „${name}" vorhanden.` : `Ollama-Modell „${name}" fehlt. Bitte im Terminal: ollama pull ${name}`);
      }
      // Modell in den Speicher laden, damit die erste echte Anfrage nicht so lange dauert
      if (da(config.llm.modell)) void fetch(`${config.llm.basisUrl}/api/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ model: config.llm.modell, messages: [], keep_alive: "30m" }) }).catch(() => {});
    } catch {
      meldungen.push(`Ollama NICHT erreichbar unter ${config.llm.basisUrl}. Läuft die Ollama-App?`);
    }
  }
  return meldungen;
}
