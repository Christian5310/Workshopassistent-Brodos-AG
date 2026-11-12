import { config } from "../config.ts";
import { MockSprachmodell, MockTranskriptQuelle } from "./mock.ts";
import type { Sprachmodell, TranskriptQuelle } from "./schnittstellen.ts";

/** Einzige Stelle, an der entschieden wird, welche Anbieter laufen. */
export function erstelleAnbieter(): { transkript: TranskriptQuelle; sprachmodell: Sprachmodell } {
  if (config.mock) return { transkript: new MockTranskriptQuelle(), sprachmodell: new MockSprachmodell() };
  throw new Error(
    "MOCK_MODE=false: Echte Anbieter (Mistral Voxtral, Broki/LLM) sind noch nicht angebunden – das folgt in Schritt 4–6. Bitte MOCK_MODE=true setzen.",
  );
}
