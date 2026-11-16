import path from "node:path";

try {
  process.loadEnvFile();
} catch {
  // keine .env vorhanden → Standardwerte (Mock-Modus)
}

const wurzel = path.resolve(import.meta.dirname, "..");
const sttAnbieter = (process.env.STT_ANBIETER || "mistral").trim().toLowerCase() === "whisper" ? "whisper" : "mistral";
const llmAnbieter = (process.env.LLM_ANBIETER || "openai").trim().toLowerCase() === "ollama" ? "ollama" : "openai";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "127.0.0.1",
  mock: (process.env.MOCK_MODE ?? "true").toLowerCase() !== "false",
  /** Mock-Anbieter, aber echte Aufnahme im Browser – zum Testen von Mikrofon und Upload ohne API-Key */
  mockMikro: (process.env.MOCK_MIKRO ?? "false").toLowerCase() === "true",
  chunkSekunden: Number(process.env.CHUNK_SECONDS ?? 60),
  mockChunkSekunden: Number(process.env.MOCK_CHUNK_SECONDS ?? 8),
  // Transkription: "mistral" (Voxtral, Cloud) oder "whisper" (lokaler Whisper-Dienst, siehe lokal/whisper_server.py)
  stt: {
    /** Start-Vorgabe; umschalten lässt es sich im Admin unter Erweitert → Transkription */
    anbieter: sttAnbieter,
    /** Mistral Voxtral (Cloud) */
    mistralUrl: "https://api.mistral.ai",
    schluessel: process.env.MISTRAL_API_KEY ?? "",
    modell: process.env.STT_MODEL || "voxtral-mini-transcribe-3-0",
    /** Lokaler Whisper-Dienst (lokal/whisper_server.py) und die beiden Modelle zum Umschalten */
    whisperUrl: (process.env.WHISPER_URL || "http://127.0.0.1:8001").replace(/\/$/, ""),
    whisperLarge: process.env.WHISPER_LARGE || "large-v3",
    whisperTurbo: process.env.WHISPER_TURBO || "large-v3-turbo",
  },
  // Sprachmodell: "ollama" (lokal, ohne Cloud) oder "openai" (OpenAI-kompatibel: Mistral, Broki/Open WebUI)
  llm: {
    anbieter: llmAnbieter,
    basisUrl: (process.env.LLM_BASE_URL || (llmAnbieter === "ollama" ? "http://127.0.0.1:11434" : "https://api.mistral.ai")).replace(/\/$/, ""),
    pfad: process.env.LLM_CHAT_PATH || (llmAnbieter === "ollama" ? "/api/chat" : "/v1/chat/completions"),
    schluessel: process.env.LLM_API_KEY || process.env.MISTRAL_API_KEY || "",
    modell: process.env.LLM_MODEL || (llmAnbieter === "ollama" ? "mistral-small3.2" : "mistral-medium-latest"),
    /** Merlin-Befehle brauchen nur ein kleines, schnelles Modell. Bei Mistral standardmäßig mistral-small, sonst wie LLM_MODEL. */
    modellMerlin: process.env.LLM_MODEL_MERLIN || (llmAnbieter === "openai" && (process.env.LLM_BASE_URL || "https://api.mistral.ai").includes("mistral.ai") ? "mistral-small-latest" : process.env.LLM_MODEL || (llmAnbieter === "ollama" ? "mistral-small3.2" : "mistral-medium-latest")),
    /** Ollama: Kontextlänge in Tokens (Standard von Ollama ist zu klein für Protokoll + Transkript) */
    kontext: Number(process.env.LLM_KONTEXT ?? 16384),
    /** Ollama: Obergrenze für lange Aufgaben (KI-Zusammenfassung eines ganzen Tages). Mehr Kontext braucht mehr Arbeitsspeicher. */
    kontextMax: Number(process.env.LLM_KONTEXT_MAX ?? 65536),
    /** Lokale Modelle brauchen länger: Mindest-Wartezeit pro Anfrage */
    zeitlimitMs: Number(process.env.LLM_ZEITLIMIT_SEKUNDEN ?? (llmAnbieter === "ollama" ? 300 : 60)) * 1000,
  },
  pfade: {
    public: path.join(wurzel, "public"),
    agenda: path.join(wurzel, "config", "agenda.json"),
    daten: path.join(wurzel, "data", "state.json"),
  },
};

/** Woher die Abschnitte kommen: echte Audio-Schnipsel aus dem Browser oder der Timer des Mock-Skripts. */
export const quelle: "mikro" | "timer" = !config.mock || config.mockMikro ? "mikro" : "timer";

/** Takt, in dem neue Transkript-Abschnitte eintreffen. */
export const zyklusSekunden = config.mock ? config.mockChunkSekunden : config.chunkSekunden;
