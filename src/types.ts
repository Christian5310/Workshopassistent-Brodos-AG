import { z } from "zod";

// Datenmodell des Protokollstands (CLAUDE.md Abschnitt 5). Jede LLM-Antwort wird dagegen validiert.
export const ProtokollSchema = z.object({
  agenda: z.array(
    z.object({ id: z.string(), titel: z.string(), status: z.enum(["offen", "läuft", "erledigt"]) }),
  ),
  todos: z.array(
    z.object({
      id: z.string(),
      text: z.string(),
      owner: z.string(),
      frist: z.string(),
      status: z.enum(["offen", "erledigt"]),
      agendapunkt: z.string(),
      /** Kategorie, unter der das To-do abgelegt wurde (z. B. "Vormittag"). Leer = aktuelle Liste. */
      gruppe: z.string().default(""),
    }),
  ),
  /** Unsichere To-dos: erst nach Bestätigung durch einen Menschen werden sie zu echten To-dos. */
  vorschlaege: z
    .array(z.object({ id: z.string(), text: z.string(), owner: z.string(), frist: z.string(), agendapunkt: z.string() }))
    .default([]),
  entscheidungen: z.array(z.object({ id: z.string(), text: z.string(), agendapunkt: z.string() })),
  offene_fragen: z.array(
    z.object({ id: z.string(), text: z.string(), status: z.enum(["offen", "beantwortet"]) }),
  ),
  notizen: z.array(z.object({ agendapunkt: z.string(), text: z.string() })),
});
export type Protokoll = z.infer<typeof ProtokollSchema>;

export const ROLLEN = ["sales", "bpm", "consultant"] as const;
export type Rolle = (typeof ROLLEN)[number];
export type Adressat = "alle" | Rolle;

export interface ChatNachricht {
  id: string;
  /** "frage" = aus dem Raum, sonst die antwortende Experten-Rolle */
  von: "frage" | Rolle;
  an?: Adressat;
  text: string;
  zeit: number;
}

export interface TranskriptAbschnitt {
  zeit: number;
  text: string;
  /** ID des Agendapunkts, der beim Sprechen ausgewählt war */
  agendapunkt?: string;
}

export type ChatStatus = "bereit" | "denkt nach";

/** Alles, was die Screens anzeigen. Wird per GET /api/state und SSE ausgeliefert. */
export interface Schnappschuss {
  /** Der aktive Tag, zu dem Protokoll, Transkript und Chat gehören */
  tag: { id: string; name: string; datum: string };
  protokoll: Protokoll;
  /** Anzeigenamen der Spezial-Agenten (in der Admin-Ansicht einstellbar) */
  agenten: Record<Rolle, { name: string }>;
  chat: ChatNachricht[];
  status: {
    aufnahme: boolean;
    /** "mikro": der Browser nimmt auf und schickt Schnipsel; "timer": Mock-Skript ohne Mikrofon */
    quelle: "mikro" | "timer";
    letzterZyklus: number | null;
    zyklusSekunden: number;
    mock: boolean;
    chat: ChatStatus;
    hinweis: string | null;
  };
}
