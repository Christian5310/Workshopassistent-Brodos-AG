import { randomUUID } from "node:crypto";
import express, { type Response } from "express";
import { erstelleAnbieter } from "./anbieter/index.ts";
import * as archiv from "./archiv.ts";
import { config, quelle, zyklusSekunden } from "./config.ts";
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
let pausiertUm = 0;
/** Audio-Schnipsel werden strikt nacheinander verarbeitet, damit die Reihenfolge im Transkript stimmt. */
let warteschlange: Promise<void> = Promise.resolve();

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
    status: { aufnahme, quelle, letzterZyklus: store.daten.letzterZyklus, zyklusSekunden, mock: config.mock, chat: chatStatus, hinweis },
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
  if (quelle === "timer") {
    zyklusTimer = setInterval(() => void zyklus(), zyklusSekunden * 1000);
    void zyklus(); // erster Abschnitt sofort, damit die Demo nicht mit Warten beginnt
  }
  senden();
}

function pausieren(neuerHinweis: string | null = null): void {
  if (aufnahme) pausiertUm = Date.now();
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

/**
 * Audio-Schnipsel aus dem Browser (Rohdaten im Body, Content-Type audio/…).
 * Das Audio bleibt nur im Arbeitsspeicher und wird nach der Transkription verworfen – nie auf die Platte.
 */
app.post("/api/audio-chunk", express.raw({ type: "audio/*", limit: "8mb" }), (req, res) => {
  if (quelle !== "mikro") return void res.status(409).json({ fehler: "Im Mock-Modus kommt das Transkript aus dem Skript, nicht vom Mikrofon." });
  // Kurz nach dem Ausschalten darf der letzte, angebrochene Schnipsel noch ankommen.
  if (!aufnahme && Date.now() - pausiertUm > 20_000) return void res.status(409).json({ fehler: "Der Assistent ist ausgeschaltet." });
  const audio = req.body as Buffer;
  if (!Buffer.isBuffer(audio) || audio.length < 1000) return void res.status(400).json({ fehler: "Kein Audio empfangen." });
  const mime = String(req.headers["content-type"] ?? "audio/webm");

  warteschlange = warteschlange.then(async () => {
    try {
      const text = await anbieter.transkript.transkribiere(audio, "protokoll", mime);
      if (text === null) return pausieren("Mock-Skript ist zu Ende. Für einen neuen Durchlauf in der Regie die Daten löschen.");
      if (text.trim()) return await verarbeiteAbschnitt(text.trim());
      store.daten.letzterZyklus = Date.now(); // Stille: nichts zu protokollieren
      senden();
    } catch (fehler) {
      console.warn("Transkription fehlgeschlagen, Schnipsel verworfen.", fehler);
      hinweis = "Die Transkription ist gerade nicht erreichbar. Der letzte Abschnitt fehlt im Protokoll.";
      senden();
    }
  });
  res.status(202).json({ ok: true, bytes: audio.length });
});

/** Rohtranskript – nur für die Regie, nie auf den Screens. */
app.get("/api/transcript", (_req, res) => {
  res.json(store.daten.transkript);
});

/** Stellt eine Frage an die Spezial-Agenten und legt Frage und Antworten im Chat ab. */
async function frageStellen(holeFrage: () => Promise<string | null>, an: Adressat, res: Response): Promise<void> {
  if (an !== "alle" && !ROLLEN.includes(an)) return void res.status(400).json({ fehler: "Unbekannter Adressat." });
  if (chatStatus !== "bereit") return void res.status(409).json({ fehler: "Die Spezial-Agenten denken noch nach." });

  chatStatus = "denkt nach";
  senden();
  try {
    const frage = (await holeFrage())?.trim();
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
    console.warn("Spezial-Agenten: Aufruf fehlgeschlagen.", fehler);
    res.status(502).json({ fehler: "Die Spezial-Agenten sind gerade nicht erreichbar." });
  } finally {
    chatStatus = "bereit";
    senden();
  }
}

/**
 * Getippte Frage. Body: { text: string, an?: "alle"|"sales"|"bpm"|"consultant" }
 * Mit { sprache: true } liefert der Mock eine Beispiel-Frage (Push-to-Talk ohne echtes Mikrofon).
 */
app.post("/api/chat", (req, res) =>
  frageStellen(
    () => (req.body?.sprache ? anbieter.transkript.transkribiere(null, "chat") : Promise.resolve(String(req.body?.text ?? ""))),
    req.body?.an ?? "alle",
    res,
  ),
);

/** Gesprochene Frage (Push-to-Talk): Audio im Body, Adressat als ?an=… Das Audio wird nach der Transkription verworfen. */
app.post("/api/chat-audio", express.raw({ type: "audio/*", limit: "8mb" }), (req, res) => {
  const audio = req.body as Buffer;
  if (!Buffer.isBuffer(audio) || audio.length < 1000) return void res.status(400).json({ fehler: "Keine Aufnahme empfangen. Knopf länger halten." });
  return frageStellen(
    () => anbieter.transkript.transkribiere(audio, "chat", String(req.headers["content-type"] ?? "audio/webm")),
    (req.query.an as Adressat) ?? "alle",
    res,
  );
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
    p.todos.push({ ...vorschlag, id: `T${nummer}`, status: "offen", gruppe: "" });
  }
  store.speichern();
  senden();
  res.json({ ok: true });
});

/**
 * To-dos der aktuellen Liste unter einer Kategorie ablegen (z. B. vor einer Pause), damit die Liste kurz bleibt.
 * Body: { name: string }. Mit { name, zurueck: true } kommt eine Kategorie wieder in die aktuelle Liste.
 */
app.post("/api/todos/ablegen", (req, res) => {
  const name = String(req.body?.name ?? "").trim().slice(0, 60);
  if (!name) return void res.status(400).json({ fehler: "Bitte einen Namen für die Kategorie angeben." });
  const [von, nach] = req.body?.zurueck ? [name, ""] : ["", name];
  const betroffen = store.daten.protokoll.todos.filter((t) => t.gruppe === von);
  for (const t of betroffen) t.gruppe = nach;
  store.speichern();
  senden();
  res.json({ ok: true, anzahl: betroffen.length });
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
  console.log(`Broki-Live läuft auf http://${config.host}:${config.port}  (${config.mock ? "MOCK-MODUS" : "Live"}, Quelle: ${quelle})`);
  console.log("  /  Auswahl   ·   /screen1  Transkriptions-Assistent   ·   /screen2  Spezial-Agenten   ·   /regie   ·   /archiv   ·   /admin");
});
