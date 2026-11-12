import type { Adressat, ChatNachricht, Protokoll, Rolle } from "../types.ts";

/**
 * Transkriptquelle – tauschbar (Mock, Mistral Voxtral, später ggf. Datei-Upload/Teams).
 * Der Mock ignoriert das Audio und liefert den nächsten Abschnitt aus dem Skript.
 */
export interface TranskriptQuelle {
  /** @returns Text oder null, wenn nichts (mehr) erkannt wurde */
  transkribiere(audio: Buffer | null, zweck: "protokoll" | "chat", mime?: string): Promise<string | null>;
}

export interface ChatKontext {
  frage: string;
  an: Adressat;
  verlauf: ChatNachricht[];
  protokoll: Protokoll;
}

/** Sprachmodell – tauschbar (Mock, Broki/OpenAI-kompatibel, Mistral). */
export interface Sprachmodell {
  /** Liefert den aktualisierten Protokollstand als ungeprüftes JSON; validiert wird beim Aufrufer. */
  chronist(stand: Protokoll, abschnitt: string): Promise<unknown>;
  expertenrunde(kontext: ChatKontext): Promise<{ von: Rolle; text: string }[]>;
}
