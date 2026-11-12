import { z } from "zod";

// Datenmodell des Protokollstands. Jede Antwort des Sprachmodells läuft durch dieses Schema.
// Es ist bewusst nachsichtig: Fehlt ein Feld oder ist es null, greift ein Standardwert; ein kaputter
// Eintrag wird einzeln verworfen, statt dass die ganze Antwort (und damit alle To-dos) verloren geht.
const text = z.coerce.string().trim().min(1);
const frei = (ersatz: string) => z.string().trim().min(1).catch(ersatz);
const kennung = z.coerce.string().catch("");
const liste = <T extends z.ZodType>(eintrag: T) =>
  z
    .array(z.unknown())
    .catch([])
    .transform((werte) => werte.flatMap((w) => { const r = eintrag.safeParse(w); return r.success ? [r.data as z.infer<T>] : []; }));

export const ProtokollSchema = z.object({
  agenda: liste(z.object({ id: kennung, titel: text, status: z.enum(["offen", "läuft", "erledigt"]).catch("offen") })),
  todos: liste(
    z.object({
      id: kennung,
      text,
      owner: frei("offen"),
      frist: frei("offen"),
      status: z.enum(["offen", "erledigt"]).catch("offen"),
      agendapunkt: z.string().catch(""),
      /** Kategorie, unter der das To-do abgelegt wurde. Leer = aktuelle Liste. */
      gruppe: z.string().catch(""),
    }),
  ),
  /** Unsichere To-dos: erst nach Bestätigung durch einen Menschen werden sie zu echten To-dos. */
  vorschlaege: liste(z.object({ id: kennung, text, owner: frei("offen"), frist: frei("offen"), agendapunkt: z.string().catch("") })),
  entscheidungen: liste(z.object({ id: kennung, text, agendapunkt: z.string().catch("") })),
  offene_fragen: liste(z.object({ id: kennung, text, status: z.enum(["offen", "beantwortet"]).catch("offen") })),
  notizen: liste(z.object({ agendapunkt: z.string().catch(""), text })),
});
export type Protokoll = z.infer<typeof ProtokollSchema>;

/** ID eines Spezial-Agenten (in der Admin-Ansicht frei anlegbar) oder "alle" */
export type Adressat = string;

export interface ChatNachricht {
  id: string;
  /** "frage" = aus dem Raum, sonst die ID des antwortenden Spezial-Agenten */
  von: string;
  /** Name des Agenten zum Zeitpunkt der Antwort (bleibt lesbar, auch wenn der Agent später gelöscht wird) */
  name?: string;
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
  tag: { id: string; name: string; datum: string } | null;
  protokoll: Protokoll;
  /** Anzeigenamen der Spezial-Agenten (in der Admin-Ansicht einstellbar) */
  agenten: { id: string; name: string; figur: string; farbe: string }[];
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
    /** Was gerade mit dem letzten Abschnitt passiert bzw. zuletzt passiert ist (für die Anzeige) */
    arbeit: string | null;
  };
}
