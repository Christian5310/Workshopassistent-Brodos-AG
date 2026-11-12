import { config } from "../config.ts";
import { OpenAiKompatiblesSprachmodell } from "./llm.ts";
import { MistralTranskriptQuelle } from "./mistral.ts";
import { MockSprachmodell, MockTranskriptQuelle } from "./mock.ts";
import type { Sprachmodell, TranskriptQuelle } from "./schnittstellen.ts";

/** Einzige Stelle, an der entschieden wird, welche Anbieter laufen. */
export function erstelleAnbieter(): { transkript: TranskriptQuelle; sprachmodell: Sprachmodell } {
  if (config.mock) return { transkript: new MockTranskriptQuelle(), sprachmodell: new MockSprachmodell() };
  if (!config.stt.schluessel) throw new Error("MOCK_MODE=false, aber MISTRAL_API_KEY fehlt in der .env (für die Transkription).");
  if (!config.llm.schluessel) throw new Error("MOCK_MODE=false, aber LLM_API_KEY fehlt in der .env (für das Sprachmodell).");
  return { transkript: new MistralTranskriptQuelle(), sprachmodell: new OpenAiKompatiblesSprachmodell() };
}
