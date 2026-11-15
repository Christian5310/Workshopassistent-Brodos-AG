import type { Adressat, ChatNachricht, Protokoll } from "../types.ts";

/**
 * Transkriptquelle – tauschbar (Mock, Mistral Voxtral, später ggf. Datei-Upload/Teams).
 * Der Mock ignoriert das Audio und liefert den nächsten Abschnitt aus dem Skript.
 */
export interface TranskriptQuelle {
  /** @returns Text oder null, wenn nichts (mehr) erkannt wurde */
  /** begriffe: zusätzliche Wörter, die die Erkennung richtig schreiben soll (z. B. Meeting-Namen bei Merlin-Befehlen) */
  transkribiere(audio: Buffer | null, zweck: "protokoll" | "chat" | "befehl", mime?: string, begriffe?: string[]): Promise<string | null>;
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
  expertenrunde(kontext: ChatKontext): Promise<{ von: string; text: string }[]>;
  /**
   * Verdichtet eingereichtes Workshop-Material zu Wissen für die Agenten.
   * Ohne Zuordnung zu Personen: Wer was gesagt hat, bleibt in der Material-Übersicht.
   */
  /** Fasst das Vorwissen eines Workshops in wenigen gesprochenen Sätzen zusammen (zum Vorlesen, ohne Namen). */
  sprechtext(wissen: string, name: string): Promise<string>;
  /** Merlin: ordnet einen Satz genau einer App-Aktion zu (nur, wenn keine feste Regel greift). Ungeprüftes JSON. */
  merlinBefehl(text: string, kontext: string): Promise<unknown>;
  verdichte(material: { titel: string; art: string; text: string }[], kontext: { name: string; agenda: string[] }): Promise<{ wissen: string; begriffe: string }>;
}
