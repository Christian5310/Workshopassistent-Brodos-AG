import { MOCK_FRAGEN, MOCK_SKRIPT } from "../mock/skript.ts";
import { store } from "../store.ts";
import { agentenFuer, einstellungen } from "../einstellungen.ts";
import type { Protokoll } from "../types.ts";
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
  /** Fake-Assistent: schlägt den Abschnitt im Skript nach und wendet die hinterlegten Änderungen an. */
  async chronist(stand: Protokoll, abschnitt: string): Promise<unknown> {
    await warte(400);
    const neu = structuredClone(stand);
    const ops = MOCK_SKRIPT.find((a) => a.text === abschnitt)?.ops ?? [];
    const aktuell = () => neu.agenda.find((a) => a.status === "läuft")?.id ?? "";

    const befehle: unknown[] = [];
    let frage: unknown = null;
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
            gruppe: "",
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
        case "befehl_loeschen": {
          const ziel = neu.todos.find((t) => t.text.includes(op.enthaelt));
          if (ziel) befehle.push({ aktion: "loeschen", id: ziel.id });
          break;
        }
        case "sprachfrage":
          frage = { an: op.an, text: op.text };
          break;
        case "notiz":
          neu.notizen.push({ agendapunkt: aktuell(), text: op.text });
          break;
      }
    }
    return { ...neu, befehle, frage };
  }

  /** Fake-Runde der Spezial-Agenten: Textbausteine, die sichtbar auf den Protokollstand zugreifen. */
  async expertenrunde({ an, protokoll }: ChatKontext): Promise<{ von: string; text: string }[]> {
    await warte(1500);
    const punkt = protokoll.agenda.find((a) => a.status === "läuft")?.titel ?? "noch kein Agendapunkt aktiv";
    const offen = protokoll.todos.filter((t) => t.status === "offen");
    const ohneOwner = offen.filter((t) => t.owner === "offen").length;
    const fragen = protokoll.offene_fragen.filter((f) => f.status === "offen").length;
    const bausteine = [
      `[Mock] Beim Punkt „${punkt}" würde ich zuerst fragen: Wie lange wartet der Kunde heute auf eine Antwort? Daran messen wir jeden neuen Schritt.`,
      `[Mock] Im Protokoll stehen ${offen.length} offene To-dos, davon ${ohneOwner} ohne Owner. Ohne Verantwortliche bleibt jede Übergabe ein Risiko.`,
      `[Mock] ${fragen} offene Frage(n) im Protokoll. Klärt die zuerst, die den Pilot blockieren würde, und legt den Rest auf einen Termin.`,
    ];
    const gefragt = agentenFuer(store.daten.agenten).filter((a) => an === "alle" || a.id === an);
    return gefragt.map((a) => {
      const i = einstellungen.agenten.indexOf(a) % bausteine.length;
      return { von: a.id, text: an === "alle" ? bausteine[i]! : `${bausteine[i]} Aus meiner Rolle (${a.name}) heraus: Legt heute fest, woran ihr den Erfolg messt.` };
    });
  }

  /** Fake-Verdichtung: listet nur auf, was eingereicht wurde (echte Verdichtung braucht ein Sprachmodell). */
  async verdichte(material: { titel: string; art: string; text: string }[], kontext: { name: string; agenda: string[] }) {
    await warte(800);
    return {
      wissen: [`# Vorwissen für „${kontext.name}" [Mock]`, "", ...material.map((m) => `- ${m.art}: ${m.titel} (${m.text.length.toLocaleString("de-DE")} Zeichen) – ${m.text.replace(/\s+/g, " ").slice(0, 140)} …`)].join("\n"),
      begriffe: "",
    };
  }
}
