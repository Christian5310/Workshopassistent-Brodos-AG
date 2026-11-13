import { randomUUID } from "node:crypto";
import express, { type Response } from "express";
import { z } from "zod";
import { erstelleAnbieter } from "./anbieter/index.ts";
import * as archiv from "./archiv.ts";
import { config, quelle } from "./config.ts";
import * as admin from "./einstellungen.ts";
import { store } from "./store.ts";
import { ProtokollSchema, type Adressat, type ChatStatus, type Schnappschuss } from "./types.ts";

const anbieter = erstelleAnbieter();

// Laufzeitstatus (bewusst nicht gespeichert: nach einem Neustart ist die Aufnahme pausiert)
let aufnahme = false;
let chatStatus: ChatStatus = "bereit";
let hinweis: string | null = null;
let arbeit: string | null = null;
const zeigeArbeit = (text: string | null) => { arbeit = text; senden(); };
let zyklusTimer: NodeJS.Timeout | null = null;
let zyklusLaeuft = false;
let pausiertUm = 0;
/** Audio-Schnipsel werden strikt nacheinander verarbeitet, damit die Reihenfolge im Transkript stimmt. */
let warteschlange: Promise<void> = Promise.resolve();

/** Takt der Abschnitte: im Mock aus der .env (für Tests), sonst aus der Admin-Ansicht. */
const takt = () => (config.mock ? config.mockChunkSekunden : admin.einstellungen.zyklusSekunden);

// ── Rückgängig: Protokollstände vor den letzten Änderungen (nur im Arbeitsspeicher, je geöffnetem Meeting) ──
const schritte: { was: string; protokoll: Schnappschuss["protokoll"] }[] = [];
/** Vor jeder Änderung aufrufen: merkt sich den Stand, damit die Änderung rückgängig gemacht werden kann. */
function merkeSchritt(was: string): void {
  schritte.push({ was, protokoll: structuredClone(store.daten.protokoll) });
  if (schritte.length > 30) schritte.shift();
}

// ── Live-Updates per Server-Sent Events ──────────────────────────────────────
const zuhoerer = new Set<Response>();

function schnappschuss(): Schnappschuss {
  return {
    tag: store.istOffen ? { id: store.daten.id, name: store.daten.name, datum: store.daten.datum } : null,
    protokoll: store.daten.protokoll,
    agenten: admin.einstellungen.agenten.map(({ id, name, figur, farbe }) => ({ id, name, figur, farbe })),
    chat: store.daten.chat,
    status: { aufnahme, quelle, letzterZyklus: store.daten.letzterZyklus, zyklusSekunden: takt(), mock: config.mock, chat: chatStatus, hinweis, arbeit, rueckgaengig: schritte.at(-1)?.was ?? null },
  };
}

function senden(): void {
  const daten = `data: ${JSON.stringify(schnappschuss())}\n\n`;
  for (const res of zuhoerer) res.write(daten);
}

// ── Chronist-Zyklus ──────────────────────────────────────────────────────────
/** Diagnose: was der Assistent je Abschnitt gehört und daraus gemacht hat (nur im Arbeitsspeicher, letzte 40). */
const diagnose: { zeit: number; text: string; ergebnis: string; ok: boolean }[] = [];
function protokolliere(text: string, ergebnis: string, ok = true): void {
  diagnose.push({ zeit: Date.now(), text, ergebnis, ok });
  if (diagnose.length > 40) diagnose.shift();
  console.log(`[${new Date().toLocaleTimeString("de-DE")}] Abschnitt (${text.length} Zeichen) → ${ergebnis}`);
  arbeit = `Letzter Abschnitt (${new Date().toLocaleTimeString("de-DE")}): ${ergebnis}`;
}

/** Zusatzfelder in der Antwort des Assistenten: Sprachbefehle und per Sprache gestellte Fragen. */
const BefehlSchema = z.object({
  aktion: z.enum(["loeschen", "aendern"]),
  id: z.coerce.string(),
  text: z.string().trim().min(1).max(300).optional().catch(undefined),
  owner: z.string().trim().min(1).max(60).optional().catch(undefined),
  frist: z.string().trim().min(1).max(60).optional().catch(undefined),
});
const ZusatzSchema = z.object({
  befehle: z.array(z.unknown()).catch([]).transform((w) => w.flatMap((x) => { const r = BefehlSchema.safeParse(x); return r.success ? [r.data] : []; })),
  frage: z.object({ an: z.string(), text: z.string().trim().min(3).max(500) }).nullable().catch(null),
});

/** Führt Sprachbefehle ("Merlin, lösche …", "Merlin, ändere …") auf dem Protokoll aus. */
function fuehreBefehleAus(p: Schnappschuss["protokoll"], befehle: z.infer<typeof BefehlSchema>[]) {
  const neu = structuredClone(p);
  const meldungen: string[] = [];
  for (const b of befehle) {
    const todo = neu.todos.find((t) => t.id === b.id);
    const vorschlag = neu.vorschlaege.find((v) => v.id === b.id);
    const entscheidung = neu.entscheidungen.find((e) => e.id === b.id);
    const frage = neu.offene_fragen.find((f) => f.id === b.id);
    const ziel = todo ?? vorschlag ?? entscheidung ?? frage;
    if (!ziel) continue;
    if (b.aktion === "loeschen") {
      neu.todos = neu.todos.filter((t) => t !== ziel);
      neu.vorschlaege = neu.vorschlaege.filter((v) => v !== ziel);
      neu.entscheidungen = neu.entscheidungen.filter((e) => e !== ziel);
      neu.offene_fragen = neu.offene_fragen.filter((f) => f !== ziel);
      meldungen.push(`gelöscht: „${ziel.text}"`);
    } else {
      const vorher = ziel.text;
      if (b.text) ziel.text = b.text;
      if (todo ?? vorschlag) {
        const t = (todo ?? vorschlag)!;
        if (b.owner) t.owner = b.owner;
        if (b.frist) t.frist = b.frist;
      }
      meldungen.push(`geändert: „${vorher}"`);
    }
  }
  return { protokoll: neu, meldungen };
}

/** Ein neuer Transkript-Abschnitt: anhängen, Protokollstand vom LLM aktualisieren lassen, validieren. */
async function verarbeiteAbschnitt(text: string): Promise<void> {
  const punkt = store.daten.protokoll.agenda.find((a) => a.status === "läuft")?.id ?? "";
  store.daten.transkript.push({ zeit: Date.now(), text, agendapunkt: punkt });
  zeigeArbeit("Transkript ist da, To-dos werden ausgewertet …"); // Transkript erscheint sofort, die Auswertung folgt
  try {
    const antwort = await anbieter.sprachmodell.chronist(store.daten.protokoll, text);
    const geprueft = ProtokollSchema.safeParse(antwort);
    if (geprueft.success) {
      const alt = store.daten.protokoll;
      let neu = admin.absichern(alt, geprueft.data, punkt);

      // Sprachbefehle und Sprachfragen gelten nur, wenn das Aktivierungswort wirklich im Abschnitt steht.
      const zusatz = ZusatzSchema.safeParse(antwort);
      const angesprochen = text.toLowerCase().includes(admin.einstellungen.aktivierungswort.toLowerCase());
      const ausgefuehrt = angesprochen && zusatz.success ? fuehreBefehleAus(neu, zusatz.data.befehle) : { protokoll: neu, meldungen: [] };
      neu = ausgefuehrt.protokoll;

      const plus = (n: number, wort: string) => (n > 0 ? [`${n} ${wort}`] : []);
      const teile = [
        ...plus(neu.todos.filter((t) => !alt.todos.some((x) => x.id === t.id)).length, "To-do(s)"),
        ...plus(neu.vorschlaege.filter((v) => !alt.vorschlaege.some((x) => x.id === v.id)).length, "Vorschlag/Vorschläge"),
        ...plus(neu.entscheidungen.length - alt.entscheidungen.length, "Entscheidung(en)"),
        ...plus(neu.offene_fragen.length - alt.offene_fragen.length, "offene Frage(n)"),
        ...plus(neu.notizen.length - alt.notizen.length, "Notiz(en)"),
        ...plus(neu.todos.filter((t) => t.status === "erledigt").length - alt.todos.filter((t) => t.status === "erledigt").length, "abgehakt"),
      ];
      const ergebnis = [...(teile.length ? [`neu: ${teile.join(", ")}`] : []), ...ausgefuehrt.meldungen];
      if (ergebnis.length) merkeSchritt(`Assistent: ${ergebnis.join("; ")}`);
      store.daten.protokoll = neu;

      const frage = angesprochen && zusatz.success ? zusatz.data.frage : null;
      if (frage && admin.einstellungen.sprachfragen) {
        ergebnis.push(`Frage an die Spezial-Agenten: „${frage.text}"`);
        // nicht abwarten: die Antwort der Agenten soll den nächsten Abschnitt nicht aufhalten
        void stelleFrage(async () => frage.text, frage.an === "alle" || admin.agent(frage.an) ? frage.an : "alle").then((r) => r.ok || console.warn("Sprachfrage:", r.fehler));
      }
      protokolliere(text, ergebnis.length ? ergebnis.join("; ") : "nichts Neues erkannt");
    } else {
      protokolliere(text, "Antwort des Sprachmodells war unbrauchbar und wurde verworfen", false);
    }
  } catch (fehler) {
    protokolliere(text, `Sprachmodell nicht erreichbar: ${fehler instanceof Error ? fehler.message.slice(0, 160) : fehler}`, false);
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
  arbeit = null;
  if (quelle === "timer") {
    zyklusTimer = setInterval(() => void zyklus(), takt() * 1000);
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
  if (!store.istOffen) return void res.status(409).json({ fehler: "Es ist kein Meeting geöffnet." });
  // Kurz nach dem Ausschalten darf der letzte, angebrochene Schnipsel noch ankommen.
  if (!aufnahme && Date.now() - pausiertUm > 20_000) return void res.status(409).json({ fehler: "Der Assistent ist ausgeschaltet." });
  const audio = req.body as Buffer;
  if (!Buffer.isBuffer(audio) || audio.length < 1000) return void res.status(400).json({ fehler: "Kein Audio empfangen." });
  const mime = String(req.headers["content-type"] ?? "audio/webm");

  console.log(`[${new Date().toLocaleTimeString("de-DE")}] Audio-Abschnitt empfangen (${Math.round(audio.length / 1024)} kB, ${mime})`);
  warteschlange = warteschlange.then(async () => {
    try {
      zeigeArbeit("Abschnitt empfangen, wird transkribiert …");
      const text = await anbieter.transkript.transkribiere(audio, "protokoll", mime);
      if (text === null) return pausieren("Mock-Skript ist zu Ende. Für einen neuen Durchlauf in der Regie die Daten löschen.");
      if (text.trim()) { hinweis = null; return await verarbeiteAbschnitt(text.trim()); }
      protokolliere("(Audio)", "nichts verstanden (Stille oder zu leise)");
      store.daten.letzterZyklus = Date.now(); // Stille: nichts zu protokollieren
      senden();
    } catch (fehler) {
      protokolliere("(Audio)", `Transkription fehlgeschlagen: ${fehler instanceof Error ? fehler.message.slice(0, 160) : fehler}`, false);
      const grund = fehler instanceof Error ? fehler.message : String(fehler);
      hinweis = `Die Transkription hat nicht geklappt, der letzte Abschnitt fehlt. Grund: ${/HTTP 401/.test(grund) ? "Der Mistral-Key wird abgelehnt (.env prüfen)." : /HTTP 4\d\d/.test(grund) ? grund.slice(0, 140) : "Mistral ist von diesem Rechner aus nicht erreichbar (Netzwerk, Firmen-Proxy oder Firewall)."}`;
      senden();
    }
  });
  res.status(202).json({ ok: true, bytes: audio.length });
});

app.get("/api/regie/diagnose", (_req, res) => {
  res.json(diagnose);
});

/**
 * Text statt Audio einspeisen (Test ohne Mikrofon, oder Plan B: Stichpunkte/Transkript von Hand einfügen).
 * Langer Text wird an Satzgrenzen in Abschnitte von rund 900 Zeichen geteilt – so groß wie eine Minute Gespräch.
 */
app.post("/api/regie/text", (req, res) => {
  if (!store.istOffen) return void res.status(409).json({ fehler: "Bitte erst im Transkriptions-Assistenten ein Meeting auswählen." });
  const text = String(req.body?.text ?? "").replace(/\s+/g, " ").trim();
  if (!text) return void res.status(400).json({ fehler: "Bitte Text eingeben." });
  const abschnitte: string[] = [];
  let aktuell = "";
  for (const satz of text.split(/(?<=[.!?…])\s+/)) {
    if (aktuell && (aktuell + " " + satz).length > 900) { abschnitte.push(aktuell); aktuell = satz; }
    else aktuell = aktuell ? `${aktuell} ${satz}` : satz;
  }
  if (aktuell) abschnitte.push(aktuell);
  // Ein Fehler darf die Warteschlange nicht dauerhaft blockieren
  for (const a of abschnitte) warteschlange = warteschlange.then(() => verarbeiteAbschnitt(a)).catch((f) => protokolliere(a, `Fehler bei der Verarbeitung: ${f}`, false));
  res.status(202).json({ ok: true, abschnitte: abschnitte.length });
});

/** Rohtranskript – nur für die Regie, nie auf den Screens. */
app.get("/api/transcript", (_req, res) => {
  res.json(store.daten.transkript);
});

/** Stellt eine Frage an die Spezial-Agenten und legt Frage und Antworten im Chat ab. */
async function stelleFrage(holeFrage: () => Promise<string | null>, an: Adressat): Promise<{ ok: true } | { ok: false; code: number; fehler: string }> {
  if (!store.istOffen) return { ok: false, code: 409, fehler: "Bitte erst im Transkriptions-Assistenten ein Meeting auswählen." };
  if (an !== "alle" && !admin.agent(an)) return { ok: false, code: 400, fehler: "Unbekannter Adressat." };
  if (chatStatus !== "bereit") return { ok: false, code: 409, fehler: "Die Spezial-Agenten denken noch nach." };

  chatStatus = "denkt nach";
  senden();
  try {
    const frage = (await holeFrage())?.trim();
    if (!frage) return { ok: false, code: 400, fehler: "Keine Frage erkannt." };

    const verlauf = [...store.daten.chat];
    store.daten.chat.push({ id: randomUUID(), von: "frage", an, text: frage, zeit: Date.now() });
    store.speichern();
    senden();

    const antworten = await anbieter.sprachmodell.expertenrunde({ frage, an, verlauf, protokoll: store.daten.protokoll });
    for (const a of antworten) store.daten.chat.push({ id: randomUUID(), von: a.von, name: admin.agent(a.von)?.name, text: a.text, zeit: Date.now() });
    store.speichern();
    return { ok: true };
  } catch (fehler) {
    console.warn("Spezial-Agenten: Aufruf fehlgeschlagen.", fehler);
    return { ok: false, code: 502, fehler: "Die Spezial-Agenten sind gerade nicht erreichbar." };
  } finally {
    chatStatus = "bereit";
    senden();
  }
}

async function frageStellen(holeFrage: () => Promise<string | null>, an: Adressat, res: Response): Promise<void> {
  const r = await stelleFrage(holeFrage, an);
  if (r.ok) res.json({ ok: true });
  else res.status(r.code).json({ fehler: r.fehler });
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
  merkeSchritt(aktion === "annehmen" ? `Vorschlag übernommen: „${vorschlag.text}"` : `Vorschlag verworfen: „${vorschlag.text}"`);
  p.vorschlaege = p.vorschlaege.filter((v) => v !== vorschlag);
  if (aktion === "annehmen") {
    const nummer = Math.max(0, ...p.todos.map((t) => Number(t.id.slice(1)) || 0)) + 1;
    p.todos.push({ ...vorschlag, id: `T${nummer}`, status: "offen", gruppe: "" });
  }
  store.speichern();
  senden();
  res.json({ ok: true });
});

/** Macht die letzte Änderung am Protokoll rückgängig (KI oder Hand). Mehrfach möglich, bis zu 30 Schritte. */
app.post("/api/rueckgaengig", (_req, res) => {
  const schritt = schritte.pop();
  if (!schritt || !store.istOffen) return void res.status(409).json({ fehler: "Es gibt nichts rückgängig zu machen." });
  // Die Agenda steuert die Moderation: ihr aktueller Stand bleibt, nur die Einträge gehen zurück.
  store.daten.protokoll = { ...schritt.protokoll, agenda: store.daten.protokoll.agenda };
  store.speichern();
  arbeit = `Rückgängig gemacht: ${schritt.was}`;
  senden();
  res.json({ ok: true, was: schritt.was });
});

/** Agendapunkt von Hand auswählen: Er läuft ab jetzt; der bisher laufende gilt als erledigt. */
app.post("/api/agenda/:id/aktiv", (req, res) => {
  const agenda = store.daten.protokoll.agenda;
  const punkt = agenda.find((a) => a.id === req.params.id);
  if (!punkt) return void res.status(404).json({ fehler: "Agendapunkt nicht gefunden." });
  for (const a of agenda) if (a.status === "läuft") a.status = "erledigt";
  punkt.status = "läuft";
  store.speichern();
  senden();
  res.json({ ok: true });
});

/** To-do von Hand ändern (Tippfehler, Owner, Frist, abhaken). Body: { text?, owner?, frist?, status? } */
app.patch("/api/todos/:id", (req, res) => {
  const todo = store.daten.protokoll.todos.find((t) => t.id === req.params.id);
  if (!todo) return void res.status(404).json({ fehler: "To-do nicht gefunden." });
  merkeSchritt(`To-do geändert: „${todo.text}"`);
  const feld = (wert: unknown, max: number) => (typeof wert === "string" && wert.trim() ? wert.trim().slice(0, max) : null);
  todo.text = feld(req.body?.text, 300) ?? todo.text;
  todo.owner = feld(req.body?.owner, 60) ?? todo.owner;
  todo.frist = feld(req.body?.frist, 60) ?? todo.frist;
  if (req.body?.status === "offen" || req.body?.status === "erledigt") todo.status = req.body.status;
  store.speichern();
  senden();
  res.json({ ok: true });
});

app.delete("/api/todos/:id", (req, res) => {
  const p = store.daten.protokoll;
  if (!p.todos.some((t) => t.id === req.params.id)) return void res.status(404).json({ fehler: "To-do nicht gefunden." });
  merkeSchritt(`To-do gelöscht: „${p.todos.find((t) => t.id === req.params.id)?.text}"`);
  p.todos = p.todos.filter((t) => t.id !== req.params.id);
  store.speichern();
  senden();
  res.json({ ok: true });
});

/**
 * To-dos der aktuellen Liste unter einer Kategorie ablegen (z. B. vor einer Pause), damit die Liste kurz bleibt.
 * Body: { name: string }. Mit { name, zurueck: true } kommt eine Kategorie wieder in die aktuelle Liste.
 */
app.post("/api/todos/ablegen", (req, res) => {
  // Ohne Namen ist die Kategorie der gerade ausgewählte Agendapunkt.
  const p = store.daten.protokoll;
  const punkt = p.agenda.find((a) => a.status === "läuft") ?? p.agenda.findLast((a) => a.status === "erledigt");
  const name = String(req.body?.name ?? punkt?.titel ?? "Ohne Agendapunkt").trim().slice(0, 120);
  const [von, nach] = req.body?.zurueck ? [name, ""] : ["", name];
  merkeSchritt(req.body?.zurueck ? `Kategorie „${name}" zurückgeholt` : `Liste abgelegt unter „${name}"`);
  const betroffen = store.daten.protokoll.todos.filter((t) => t.gruppe === von);
  for (const t of betroffen) t.gruppe = nach;
  store.speichern();
  senden();
  res.json({ ok: true, anzahl: betroffen.length });
});

app.post("/api/regie/start", (_req, res) => {
  if (!store.istOffen) return void res.status(409).json({ fehler: "Bitte erst ein Meeting auswählen." });
  starten();
  res.json({ ok: true });
});

app.post("/api/regie/pause", (_req, res) => {
  pausieren();
  res.json({ ok: true });
});

app.post("/api/regie/reset", (_req, res) => {
  pausieren();
  schritte.length = 0;
  store.leeren();
  senden();
  res.json({ ok: true });
});

// ── Admin: Prompts, Hintergrundwissen, Agenda und Agenten einstellen ──
app.get("/api/admin/einstellungen", (_req, res) => {
  res.json({ einstellungen: admin.einstellungen, standard: admin.standard(), mock: config.mock, figuren: admin.FIGUREN, farben: admin.FARBEN });
});

/** Speichert Prompts und Obergrenze ("Erweitert"). Agenten und Meetings haben eigene Endpunkte. */
app.put("/api/admin/einstellungen", (req, res) => {
  const geprueft = admin.ErweitertSchema.safeParse(req.body);
  if (!geprueft.success) {
    const erster = geprueft.error.issues[0];
    return void res.status(400).json({ fehler: `Ungültige Eingabe bei „${erster?.path.join(".")}": ${erster?.message}` });
  }
  admin.speichere({ ...admin.einstellungen, ...geprueft.data });
  senden(); // neuer Takt gilt ab dem nächsten Abschnitt
  res.json({ ok: true });
});

// ── Spezial-Agenten anlegen, ändern, löschen ──
const agentAusBody = (body: unknown, res: Response) => {
  const geprueft = admin.AgentEingabeSchema.safeParse(body);
  if (!geprueft.success) res.status(400).json({ fehler: "Bitte Name (höchstens 40 Zeichen), Prompt und Wissen prüfen." });
  return geprueft.success ? geprueft.data : null;
};

app.post("/api/agenten", (req, res) => {
  const d = agentAusBody(req.body, res);
  if (!d) return;
  if (admin.einstellungen.agenten.length >= 12) return void res.status(400).json({ fehler: "Mehr als 12 Agenten sind nicht möglich." });
  const neu = admin.agentAnlegen(d);
  senden();
  res.json({ ok: true, id: neu.id });
});

app.put("/api/agenten/:id", (req, res) => {
  const d = agentAusBody(req.body, res);
  if (!d) return;
  if (!admin.agent(req.params.id)) return void res.status(404).json({ fehler: "Agent nicht gefunden." });
  admin.speichere({ ...admin.einstellungen, agenten: admin.einstellungen.agenten.map((a) => (a.id === req.params.id ? { ...d, id: a.id } : a)) });
  senden();
  res.json({ ok: true });
});

app.delete("/api/agenten/:id", (req, res) => {
  if (!admin.agent(req.params.id)) return void res.status(404).json({ fehler: "Agent nicht gefunden." });
  if (admin.einstellungen.agenten.length <= 1) return void res.status(400).json({ fehler: "Mindestens ein Agent muss bleiben." });
  admin.speichere({ ...admin.einstellungen, agenten: admin.einstellungen.agenten.filter((a) => a.id !== req.params.id) });
  senden();
  res.json({ ok: true });
});

/** Zeigt den Prompt der Spezial-Agenten mit eingesetzten Platzhaltern – so bekommt ihn das Sprachmodell. */
app.get("/api/admin/vorschau", (_req, res) => {
  const fertig = admin.promptAgentenFertig(store.daten);
  res.json({ promptAgenten: fertig, zeichen: fertig.length });
});

// ── Tage: Workshop-Tage mit Agenda anlegen, auswählen, ansehen, herunterladen, löschen ──
const TagSchema = z.object({
  name: z.string().trim().min(1).max(80),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  agenda: z.array(z.string().trim().min(1).max(120)).max(30),
  briefing: z.string().max(50_000).optional(),
  begriffe: z.string().max(4000).optional(),
});
const tagAusBody = (body: unknown, res: Response) => {
  const geprueft = TagSchema.safeParse(body);
  if (!geprueft.success) res.status(400).json({ fehler: "Bitte Name, Datum und Agenda prüfen (ein Agendapunkt pro Zeile, höchstens 120 Zeichen)." });
  return geprueft.success ? geprueft.data : null;
};
const holeTag = (id: string, res: Response) => {
  const tag = store.hole(id);
  if (!tag) res.status(404).json({ fehler: "Meeting nicht gefunden." });
  return tag;
};

app.get("/api/tage", (_req, res) => {
  res.json(store.liste().map((t) => archiv.kurzinfo(t, store.istOffen ? store.daten.id : "")));
});

app.post("/api/tage", (req, res) => {
  const d = tagAusBody(req.body, res);
  if (!d) return;
  const tag = store.erstelle(d);
  res.json({ ok: true, id: tag.id });
});

app.put("/api/tage/:id", (req, res) => {
  const d = tagAusBody(req.body, res);
  if (!d) return;
  if (!store.aendere(req.params.id, d)) return void res.status(404).json({ fehler: "Meeting nicht gefunden." });
  senden();
  res.json({ ok: true });
});

/** Macht einen Tag zum aktiven: Ab jetzt laufen Transkript, To-dos und Chat dort. */
app.post("/api/tage/:id/aktivieren", (req, res) => {
  if (aufnahme) return void res.status(409).json({ fehler: "Bitte erst pausieren, dann das Meeting wechseln." });
  if (!store.wechsle(req.params.id)) return void res.status(404).json({ fehler: "Meeting nicht gefunden." });
  schritte.length = 0;
  hinweis = null;
  senden();
  res.json({ ok: true });
});

/**
 * Meeting schließen: Aufnahme beenden, ausstehende Abschnitte fertig verarbeiten, als abgeschlossen markieren.
 * Danach ist im Assistenten kein Meeting mehr geöffnet; alles liegt im Archiv.
 */
app.post("/api/meeting/schliessen", async (_req, res) => {
  if (!store.istOffen) return void res.status(409).json({ fehler: "Es ist kein Meeting geöffnet." });
  pausieren();
  await warteschlange.catch(() => {}); // der letzte Abschnitt soll noch ins Protokoll
  const tag = store.schliesse();
  schritte.length = 0;
  hinweis = null;
  arbeit = null;
  senden();
  res.json({ ok: true, id: tag?.id });
});

app.get("/api/tage/:id", (req, res) => {
  const tag = holeTag(req.params.id, res);
  if (tag) res.json({ ...tag, aktiv: store.istOffen && tag.id === store.daten.id, zusammenfassung: archiv.zusammenfassung(tag.protokoll) });
});

/** Downloads als Markdown: ?art=alles|transkript|todos|entscheidungen|fragen */
app.get("/api/tage/:id/markdown", (req, res) => {
  const tag = holeTag(req.params.id, res);
  if (!tag) return;
  const art = (String(req.query.art ?? "alles") in archiv.DOWNLOADS ? String(req.query.art ?? "alles") : "alles") as keyof typeof archiv.DOWNLOADS;
  res.attachment(`${tag.datum}-${art === "alles" ? "protokoll" : art}.md`).type("text/markdown; charset=utf-8").send(archiv.DOWNLOADS[art](tag));
});

/** To-do-Liste als CSV für Excel. */
app.get("/api/tage/:id/todos.csv", (req, res) => {
  const tag = holeTag(req.params.id, res);
  if (tag) res.attachment(`${tag.datum}-todos.csv`).type("text/csv; charset=utf-8").send(archiv.todosCsv(tag));
});

app.get("/api/tage/:id/broki", (req, res) => {
  const tag = holeTag(req.params.id, res);
  if (tag) res.type("text/plain; charset=utf-8").send(archiv.fuerBroki(tag, admin.einstellungen.promptZusammenfassung));
});

app.delete("/api/tage/:id", (req, res) => {
  if (aufnahme && req.params.id === store.daten.id) return void res.status(409).json({ fehler: "Bitte erst pausieren." });
  if (!store.loesche(req.params.id)) return void res.status(404).json({ fehler: "Meeting nicht gefunden." });
  senden();
  res.json({ ok: true });
});

app.use(express.static(config.pfade.public, { extensions: ["html"] }));

app.listen(config.port, config.host, () => {
  console.log(`Merlin läuft auf http://${config.host}:${config.port}  (${config.mock ? "MOCK-MODUS" : "Live"}, Quelle: ${quelle})`);
  console.log("  /  Eröffnung   ·   /start  Auswahl   ·   /screen1  Transkriptions-Assistent   ·   /screen2  Spezial-Agenten   ·   /regie   ·   /archiv   ·   /admin");
});
