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
  chunkSekunden: Number(process.env.CHUNK_SECONDS ?? 60),
  mockChunkSekunden: Number(process.env.MOCK_CHUNK_SECONDS ?? 8),
  pfade: {
    public: path.join(wurzel, "public"),
    agenda: path.join(wurzel, "config", "agenda.json"),
    daten: path.join(wurzel, "data", "state.json"),
  },
};

/** Takt, in dem neue Transkript-Abschnitte eintreffen. */
export const zyklusSekunden = config.mock ? config.mockChunkSekunden : config.chunkSekunden;
