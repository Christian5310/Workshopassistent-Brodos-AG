import { config } from "../config.ts";
import { OpenAiKompatiblesSprachmodell } from "./llm.ts";
import { MistralTranskriptQuelle } from "./mistral.ts";
import { WhisperTranskriptQuelle } from "./whisper.ts";
import { MockSprachmodell, MockTranskriptQuelle } from "./mock.ts";
import type { Sprachmodell, TranskriptQuelle } from "./schnittstellen.ts";

/** Einzige Stelle, an der entschieden wird, welche Anbieter laufen. */
export function erstelleAnbieter(): { transkript: TranskriptQuelle; sprachmodell: Sprachmodell } {
  if (config.mock) return { transkript: new MockTranskriptQuelle(), sprachmodell: new MockSprachmodell() };
  // Schlüssel braucht nur, was in der Cloud läuft. Lokal (Whisper, Ollama) geht ohne.
  if (config.stt.anbieter === "mistral" && !config.stt.schluessel) throw new Error("MOCK_MODE=false, aber MISTRAL_API_KEY fehlt in der .env (für die Transkription). Für lokal: STT_ANBIETER=whisper.");
  if (config.llm.anbieter === "openai" && !config.llm.schluessel) throw new Error("MOCK_MODE=false, aber LLM_API_KEY fehlt in der .env (für das Sprachmodell). Für lokal: LLM_ANBIETER=ollama.");
  return {
    transkript: config.stt.anbieter === "whisper" ? new WhisperTranskriptQuelle() : new MistralTranskriptQuelle(),
    sprachmodell: new OpenAiKompatiblesSprachmodell(),
  };
}

/** Beschreibung für Start-Ausgabe und Regie: was läuft wo? */
export function anbieterInfo(): string {
  if (config.mock) return "Mock (ohne KI)";
  const stt = config.stt.anbieter === "whisper" ? `Whisper lokal (${config.stt.modell}, ${config.stt.basisUrl})` : `Mistral Voxtral (Cloud)`;
  const llm = config.llm.anbieter === "ollama" ? `Ollama lokal (${config.llm.modell}, ${config.llm.basisUrl})` : `${config.llm.modell} (${config.llm.basisUrl})`;
  return `Transkription: ${stt} · Sprachmodell: ${llm}`;
}

/** Prüft beim Start, ob die lokalen Dienste laufen und das Modell geladen ist; lädt das Sprachmodell vor. */
export async function pruefeLokal(): Promise<string[]> {
  const meldungen: string[] = [];
  if (config.mock) return meldungen;
  if (config.stt.anbieter === "whisper") {
    try {
      const r = await fetch(`${config.stt.basisUrl}/health`, { signal: AbortSignal.timeout(3000) });
      meldungen.push(r.ok ? "Whisper-Dienst erreichbar." : `Whisper-Dienst antwortet mit HTTP ${r.status}.`);
    } catch {
      meldungen.push(`Whisper-Dienst NICHT erreichbar unter ${config.stt.basisUrl}. Bitte lokal/start-whisper.cmd starten.`);
    }
  }
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
