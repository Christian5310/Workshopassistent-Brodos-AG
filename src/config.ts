import path from "node:path";

try {
  process.loadEnvFile();
} catch {
  // keine .env vorhanden → Standardwerte (Mock-Modus)
}

const wurzel = path.resolve(import.meta.dirname, "..");

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "127.0.0.1",
  mock: (process.env.MOCK_MODE ?? "true").toLowerCase() !== "false",
  /** Mock-Anbieter, aber echte Aufnahme im Browser – zum Testen von Mikrofon und Upload ohne API-Key */
  mockMikro: (process.env.MOCK_MIKRO ?? "false").toLowerCase() === "true",
  chunkSekunden: Number(process.env.CHUNK_SECONDS ?? 60),
  mockChunkSekunden: Number(process.env.MOCK_CHUNK_SECONDS ?? 8),
  // Transkription (Mistral Voxtral) – Schlüssel nur serverseitig
  stt: {
    basisUrl: process.env.STT_BASE_URL || "https://api.mistral.ai",
    schluessel: process.env.MISTRAL_API_KEY ?? "",
    modell: process.env.STT_MODEL || "voxtral-mini-transcribe-3-0",
  },
  // Sprachmodell (OpenAI-kompatibel). Ohne eigene Angaben läuft es über Mistral mit demselben Schlüssel.
  llm: {
    basisUrl: (process.env.LLM_BASE_URL || "https://api.mistral.ai").replace(/\/$/, ""),
    pfad: process.env.LLM_CHAT_PATH || "/v1/chat/completions",
    schluessel: process.env.LLM_API_KEY || process.env.MISTRAL_API_KEY || "",
    modell: process.env.LLM_MODEL || "mistral-medium-latest",
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
