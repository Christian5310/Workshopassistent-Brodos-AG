import { randomUUID } from "node:crypto";
import express, { type Response } from "express";
import { erstelleAnbieter } from "./anbieter/index.ts";
import * as archiv from "./archiv.ts";
import { config, zyklusSekunden } from "./config.ts";
import * as admin from "./einstellungen.ts";
import { store } from "./store.ts";
import { ProtokollSchema, ROLLEN, type Adressat, type ChatStatus, type Schnappschuss } from "./types.ts";

const anbieter = erstelleAnbieter();

// Laufzeitstatus (bewusst nicht gespeichert: nach einem Neustart ist die Aufnahme pausiert)
let aufnahme = false;
let chatStatus: ChatStatus = "bereit";
let hinweis: string | null = null;
let zyklusTimer: NodeJS.Timeout | null = null;
let zyklusLaeuft = false;

// ── Live-Updates per Server-Sent Events ──────────────────────────────────────
const zuhoerer = new Set<Response>();

function schnappschuss(): Schnappschuss {
  return {
    protokoll: store.daten.protokoll,
    agenten: {
      sales: { name: admin.einstellungen.agenten.sales.name },
      bpm: { name: admin.einstellungen.agenten.bpm.name },
      consultant: { name: admin.einstellungen.agenten.consultant.name },
    },
    chat: store.daten.chat,
    status: { aufnahme, letzterZyklus: store.daten.letzterZyklus, zyklusSekunden, mock: config.mock, chat: chatStatus, hinweis },
  };
}

function senden(): void {
  const daten = `data: ${JSON.stringify(schnappschuss())}\n\n`;
  for (const res of zuhoerer) res.write(daten);
}

// ── Chronist-Zyklus ──────────────────────────────────────────────────────────
/** Ein neuer Transkript-Abschnitt: anhängen, Protokollstand vom LLM aktualisieren lassen, validieren. */
async function verarbeiteAbschnitt(text: string): Promise<void> {
  store.daten.transkript.push({ zeit: Date.now(), text });
  try {
    const antwort = await anbieter.sprachmodell.chronist(store.daten.protokoll, text);
    const geprueft = ProtokollSchema.safeParse(antwort);
    if (geprueft.success) store.daten.protokoll = admin.absichern(store.daten.protokoll, geprueft.data);
    else console.warn("Assistent: ungültige Antwort verworfen, Stand bleibt unverändert.");
  } catch (fehler) {
    console.warn("Assistent: Aufruf fehlgeschlagen, Stand bleibt unverändert.", fehler);
  }
  store.daten.letzterZyklus = Date.now();
  store.speichern();
  senden();
}

/** Mock-Modus: der Timer ersetzt die Audio-Schnipsel aus dem Browser (kommen in Schritt 3). */
async function zyklus(): Promise<void> {
  if (zyklusLaeuft) return;
  zyklusLaeuft = true;
  try {
    const text = await anbieter.transkript.transkribiere(null, "protokoll");
    if (text === null) {
      pausieren("Mock-Skript ist zu Ende. Für einen neuen Durchlauf in der Regie die Daten löschen.");
      return;
    }
    await verarbeiteAbschnitt(text);
  } finally {
    zyklusLaeuft = false;
  }
}

function starten(): void {
  if (aufnahme) return;
  aufnahme = true;
  hinweis = null;
  zyklusTimer = setInterval(() => void zyklus(), zyklusSekunden * 1000);
  void zyklus(); // erster Abschnitt sofort, damit die Demo nicht mit Warten beginnt
  senden();
}

function pausieren(neuerHinweis: string | null = null): void {
  aufnahme = false;
  hinweis = neuerHinweis;
  if (zyklusTimer) clearInterval(zyklusTimer);
  zyklusTimer = null;
  senden();
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/api/state", (_req, res) => {
  res.json(schnappschuss());
});

app.get("/api/events", (req, res) => {
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  res.write(`data: ${JSON.stringify(schnappschuss())}\n\n`);
  zuhoerer.add(res);
  req.on("close", () => zuhoerer.delete(res));
});

/** Rohtranskript – nur für die Regie, nie auf den Screens. */
app.get("/api/transcript", (_req, res) => {
  res.json(store.daten.transkript);
});

/**
 * Frage an die Expertenrunde. Body: { text?: string, an?: "alle"|"sales"|"bpm"|"consultant", sprache?: boolean }
 * sprache=true steht für Push-to-Talk; im Mock liefert die Transkriptquelle dann eine Beispiel-Frage.
 */
app.post("/api/chat", async (req, res) => {
  const an: Adressat = req.body?.an ?? "alle";
  if (an !== "alle" && !ROLLEN.includes(an)) return void res.status(400).json({ fehler: "Unbekannter Adressat." });
  if (chatStatus !== "bereit") return void res.status(409).json({ fehler: "Die Spezial-Agenten denken noch nach." });

  chatStatus = "denkt nach";
  senden();
  try {
    const frage = req.body?.sprache
      ? await anbieter.transkript.transkribiere(null, "chat")
      : String(req.body?.text ?? "").trim();
    if (!frage) return void res.status(400).json({ fehler: "Keine Frage erkannt." });

    const verlauf = [...store.daten.chat];
    store.daten.chat.push({ id: randomUUID(), von: "frage", an, text: frage, zeit: Date.now() });
    store.speichern();
    senden();

    const antworten = await anbieter.sprachmodell.expertenrunde({ frage, an, verlauf, protokoll: store.daten.protokoll });
    for (const a of antworten) store.daten.chat.push({ id: randomUUID(), von: a.von, text: a.text, zeit: Date.now() });
    store.speichern();
    res.json({ ok: true });
  } catch (fehler) {
    console.warn("Expertenrunde: Aufruf fehlgeschlagen.", fehler);
    res.status(502).json({ fehler: "Die Spezial-Agenten sind gerade nicht erreichbar." });
  } finally {
    chatStatus = "bereit";
    senden();
  }
});

/** Vorschlag bestätigen (wird zum To-do) oder verwerfen. */
app.post("/api/vorschlag/:id/:aktion", (req, res) => {
  const p = store.daten.protokoll;
  const vorschlag = p.vorschlaege.find((v) => v.id === req.params.id);
  const { aktion } = req.params;
  if (!vorschlag || (aktion !== "annehmen" && aktion !== "verwerfen")) return void res.status(404).json({ fehler: "Vorschlag nicht gefunden." });
  p.vorschlaege = p.vorschlaege.filter((v) => v !== vorschlag);
  if (aktion === "annehmen") {
    const nummer = Math.max(0, ...p.todos.map((t) => Number(t.id.slice(1)) || 0)) + 1;
    p.todos.push({ ...vorschlag, id: `T${nummer}`, status: "offen" });
  }
  store.speichern();
  senden();
  res.json({ ok: true });
});

app.post("/api/regie/start", (_req, res) => {
  starten();
  res.json({ ok: true });
});

app.post("/api/regie/pause", (_req, res) => {
  pausieren();
  res.json({ ok: true });
});

app.post("/api/regie/reset", (_req, res) => {
  pausieren();
  store.loeschen();
  senden();
  res.json({ ok: true });
});

// ── Admin: Prompts, Hintergrundwissen, Agenda und Agenten einstellen ──
app.get("/api/admin/einstellungen", (_req, res) => {
  res.json({ einstellungen: admin.einstellungen, standard: admin.standard(), mock: config.mock });
});

app.put("/api/admin/einstellungen", (req, res) => {
  const geprueft = admin.EinstellungenSchema.safeParse(req.body);
  if (!geprueft.success) {
    const erster = geprueft.error.issues[0];
    return void res.status(400).json({ fehler: `Ungültige Eingabe bei „${erster?.path.join(".")}": ${erster?.message}` });
  }
  admin.speichere(geprueft.data);
  admin.agendaAnwenden(store.daten.protokoll); // gilt sofort, auch in der laufenden Sitzung
  store.speichern();
  senden();
  res.json({ ok: true });
});

/** Zeigt den Prompt der Spezial-Agenten mit eingesetzten Platzhaltern – so bekommt ihn das Sprachmodell. */
app.get("/api/admin/vorschau", (_req, res) => {
  const fertig = admin.promptAgentenFertig(store.daten.protokoll);
  res.json({ promptAgenten: fertig, zeichen: fertig.length });
});

// ── Archiv: Transkripte, Zusammenfassungen sowie Fragen und Antworten dauerhaft ablegen ──
app.get("/api/archiv", (_req, res) => {
  res.json(archiv.uebersicht());
});

/** Legt den aktuellen Stand im Archiv ab. Body: { titel?: string } */
app.post("/api/archiv", (req, res) => {
  const d = store.daten;
  if (!d.transkript.length && !d.chat.length) return void res.status(400).json({ fehler: "Es gibt noch nichts zu archivieren." });
  const eintrag = archiv.archiviere(String(req.body?.titel ?? ""));
  res.json({ ok: true, id: eintrag.id });
});

app.get("/api/archiv/:id", (req, res) => {
  const eintrag = archiv.lies(req.params.id);
  if (!eintrag) return void res.status(404).json({ fehler: "Eintrag nicht gefunden." });
  res.json(eintrag);
});

app.get("/api/archiv/:id/markdown", (req, res) => {
  const eintrag = archiv.lies(req.params.id);
  if (!eintrag) return void res.status(404).json({ fehler: "Eintrag nicht gefunden." });
  res.attachment(`workshop-${eintrag.id.slice(0, 10)}.md`).type("text/markdown; charset=utf-8").send(archiv.alsMarkdown(eintrag));
});

app.get("/api/archiv/:id/broki", (req, res) => {
  const eintrag = archiv.lies(req.params.id);
  if (!eintrag) return void res.status(404).json({ fehler: "Eintrag nicht gefunden." });
  res.type("text/plain; charset=utf-8").send(archiv.fuerBroki(eintrag));
});

app.delete("/api/archiv/:id", (req, res) => {
  if (!archiv.loesche(req.params.id)) return void res.status(404).json({ fehler: "Eintrag nicht gefunden." });
  res.json({ ok: true });
});

app.delete("/api/archiv", (_req, res) => {
  archiv.loescheAlles();
  res.json({ ok: true });
});

app.use(express.static(config.pfade.public, { extensions: ["html"] }));

app.listen(config.port, config.host, () => {
  console.log(`Broki-Live läuft auf http://${config.host}:${config.port}  (${config.mock ? "MOCK-MODUS" : "Live"})`);
  console.log("  /  Auswahl   ·   /screen1  Transkriptions-Assistent   ·   /screen2  Spezial-Agenten   ·   /regie   ·   /archiv   ·   /admin");
});
