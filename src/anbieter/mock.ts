import { MOCK_FRAGEN, MOCK_SKRIPT } from "../mock/skript.ts";
import { store } from "../store.ts";
import type { Protokoll, Rolle } from "../types.ts";
import type { ChatKontext, Sprachmodell, TranskriptQuelle } from "./schnittstellen.ts";

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockTranskriptQuelle implements TranskriptQuelle {
  async transkribiere(_audio: Buffer | null, zweck: "protokoll" | "chat"): Promise<string | null> {
    if (zweck === "chat") {
      const frage = MOCK_FRAGEN[store.daten.mockFragenCursor % MOCK_FRAGEN.length];
      store.daten.mockFragenCursor++;
      await warte(600);
      return frage ?? null;
    }
    const abschnitt = MOCK_SKRIPT[store.daten.mockCursor];
    if (!abschnitt) return null; // Skript zu Ende
    store.daten.mockCursor++;
    return abschnitt.text;
  }
}

export class MockSprachmodell implements Sprachmodell {
  /** Fake-Chronist: schlägt den Abschnitt im Skript nach und wendet die hinterlegten Änderungen an. */
  async chronist(stand: Protokoll, abschnitt: string): Promise<unknown> {
    await warte(400);
    const neu = structuredClone(stand);
    const ops = MOCK_SKRIPT.find((a) => a.text === abschnitt)?.ops ?? [];
    const aktuell = () => neu.agenda.find((a) => a.status === "läuft")?.id ?? "";

    for (const op of ops) {
      switch (op.typ) {
        case "agenda": {
          const punkt = neu.agenda.find((a) => a.id === op.id);
          if (punkt) punkt.status = op.status;
          break;
        }
        case "todo":
          neu.todos.push({
            id: `T${neu.todos.length + 1}`,
            text: op.text,
            owner: op.owner ?? "offen",
            frist: op.frist ?? "offen",
            status: "offen",
            agendapunkt: aktuell(),
          });
          break;
        case "vorschlag":
          neu.vorschlaege.push({ id: `neu-${neu.vorschlaege.length}`, text: op.text, owner: op.owner ?? "offen", frist: "offen", agendapunkt: aktuell() });
          break;
        case "todo_erledigt": {
          const todo = neu.todos.find((t) => t.text.includes(op.enthaelt));
          if (todo) todo.status = "erledigt";
          break;
        }
        case "entscheidung":
          neu.entscheidungen.push({ id: `E${neu.entscheidungen.length + 1}`, text: op.text, agendapunkt: aktuell() });
          break;
        case "frage":
          neu.offene_fragen.push({ id: `F${neu.offene_fragen.length + 1}`, text: op.text, status: "offen" });
          break;
        case "frage_beantwortet": {
          const frage = neu.offene_fragen.find((f) => f.text.includes(op.enthaelt));
          if (frage) frage.status = "beantwortet";
          break;
        }
        case "notiz":
          neu.notizen.push({ agendapunkt: aktuell(), text: op.text });
          break;
      }
    }
    return neu;
  }

  /** Fake-Expertenrunde: feste Textbausteine, die sichtbar auf den Protokollstand zugreifen. */
  async expertenrunde({ an, protokoll }: ChatKontext): Promise<{ von: Rolle; text: string }[]> {
    await warte(1500);
    const punkt = protokoll.agenda.find((a) => a.status === "läuft")?.titel ?? "noch kein Agendapunkt aktiv";
    const offen = protokoll.todos.filter((t) => t.status === "offen");
    const ohneOwner = offen.filter((t) => t.owner === "offen").length;
    const fragen = protokoll.offene_fragen.filter((f) => f.status === "offen").length;

    const kurz: Record<Rolle, string> = {
      sales: `[Mock] Beim Punkt „${punkt}" würde ich zuerst fragen: Wie lange wartet der Kunde heute auf eine Antwort? Daran messen wir jeden neuen Schritt.`,
      bpm: `[Mock] Im Protokoll stehen ${offen.length} offene To-dos, davon ${ohneOwner} ohne Owner. Ohne Verantwortliche bleibt jede Übergabe ein Risiko.`,
      consultant: `[Mock] ${fragen} offene Frage(n) im Protokoll. Klärt die zuerst, die den Pilot blockieren würde, und legt den Rest auf einen Termin.`,
    };
    const lang: Record<Rolle, string> = {
      sales: `${kurz.sales} Der Außendienst akzeptiert neue Schritte nur, wenn sie ihm Zeit beim Kunden zurückgeben. Fragt also bei jedem Schritt: Hilft das dem Abschluss?`,
      bpm: `${kurz.bpm} Prüft pro Schritt: feste Regel oder Urteil? Regeln automatisiert ihr klassisch, nur für Urteile lohnt ein Agent.`,
      consultant: `${kurz.consultant} Ein guter Pilot zeigt in 4–6 Wochen Wirkung und braucht nur ein Team. Legt heute fest, woran ihr den Erfolg messt.`,
    };
    if (an !== "alle") return [{ von: an, text: lang[an] }];
    return (["sales", "bpm", "consultant"] as const).map((von) => ({ von, text: kurz[von] }));
  }
}
