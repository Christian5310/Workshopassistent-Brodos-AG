// Testlauf für die drei Spezial-Agenten (Wissen, Prompts, Verhalten).
// Aufruf: npm.cmd run agententest -- [--trocken] [--ohne-briefing] [--block A2] [--ids A1-01,A2-05] [--typ X] [--anzahl 5] [--parallel 4] [--modell claude-haiku-5-5] [--ordner docs/agenten]
// Liest Prompts, Wissen, Briefing und Fragen aus dem Ordner (Standard docs/agenten), setzt den Prompt wie die App zusammen,
// stellt jede Frage einzeln an das Sprachmodell (.env: LLM_*), prüft automatisch und schreibt einen Bericht nach data/testergebnisse/.
// Es werden keine Daten der App (data/einstellungen.json, Meetings) gelesen oder verändert.
import fs from "node:fs";
import path from "node:path";
import { config } from "../src/config.ts";
import {
  ausschnittVon, baueSystemPrompt, formatHinweis, istUebersichtsfrage, uebersichtsAdressat, frageNachricht, leseAntworten, leseJson, liesAgenda, liesAusschnitte, liesFragen, liesPromptBloecke,
  pruefeAntwort, sammleNamen, type AgentDef, type Antwort, type Frage, type Verstoss,
} from "./agententest-kern.ts";

const wurzel = path.resolve(import.meta.dirname, "..");

// ── Argumente ──
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const wert = (name: string) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const ordner = path.resolve(wurzel, wert("ordner") ?? "docs/agenten");
const modell = wert("modell") ?? config.llm.modell;
const parallel = Math.max(1, Number(wert("parallel") ?? 4));

// ── Eingaben lesen ──
const lies = (datei: string) => {
  const pfad = path.join(ordner, datei);
  if (!fs.existsSync(pfad)) throw new Error(`Datei fehlt: ${pfad}`);
  return fs.readFileSync(pfad, "utf8");
};
const testfragen = lies("testfragen.md");
const [gesamt, vBeschr, kBeschr, bBeschr] = liesPromptBloecke(lies("prompts.md"));
if (!gesamt || !vBeschr || !kBeschr || !bBeschr) throw new Error("prompts.md: erwartet vier Texte zwischen ----- Zeilen (Gesamt, Vertrieb, KI, BPM).");
// --ohne-briefing: wie in der App, wenn das Briefing-Feld des Workshops leer ist (Rahmen steht dann nur im Gesamt-Prompt)
const briefing = flag("ohne-briefing") ? "" : lies("briefing-workshop.md");
const agenten: AgentDef[] = [
  { id: "sales", kuerzel: "V", name: "Vertriebsexperte", beschreibung: vBeschr, wissen: lies("wissen-vertrieb.md") },
  { id: "consultant", kuerzel: "K", name: "KI- und Automatisierungsexperte", beschreibung: kBeschr, wissen: lies("wissen-ki-automatisierung.md") },
  { id: "bpm", kuerzel: "B", name: "BPM-Experte", beschreibung: bBeschr, wissen: lies("wissen-bpm.md") },
];
// Agenda: aus testfragen.md ("- A1: Titel"), sonst die Standard-Agenda der App (config/agenda.json)
const agenda: string[] = liesAgenda(testfragen).length === 5 ? liesAgenda(testfragen) : (JSON.parse(fs.readFileSync(path.join(wurzel, "config", "agenda.json"), "utf8")) as { titel: string }[]).map((a) => a.titel);
const ausschnitte = liesAusschnitte(testfragen);
// --langes-transkript 60000: hängt so viele Zeichen Füll-Transkript an (Lasttest: in der App gehen bis zu 60.000 Zeichen der letzten 60 Minuten mit)
const langesTranskript = Number(wert("langes-transkript") ?? 0);
const fuelltext = () => { const teile = Object.values(ausschnitte); let t = ""; while (t.length < langesTranskript) t += teile[(t.length / 7) % teile.length | 0] + " "; return t.slice(0, langesTranskript); };

// Namensliste aus den Quelldateien (nur lokal gelesen, nichts davon wird ausgegeben oder gespeichert)
const quellOrdner = [path.join(wurzel, "docs", "wissen"), process.env.AGENTENTEST_NAMEN_ORDNER ?? ""].filter((o) => o && fs.existsSync(o));
const namen = sammleNamen(quellOrdner.flatMap((o) => fs.readdirSync(o).filter((f) => /Abteilungen|Kontext/i.test(f) && f.endsWith(".md")).map((f) => fs.readFileSync(path.join(o, f), "utf8"))));

// ── Fragen auswählen ──
let fragen: Frage[] = liesFragen(testfragen);
const ids = wert("ids")?.split(",").map((s) => s.trim());
if (ids) fragen = fragen.filter((f) => ids.includes(f.id));
if (wert("block")) fragen = fragen.filter((f) => f.block === wert("block"));
if (wert("typ")) fragen = fragen.filter((f) => f.typ === wert("typ"));
if (wert("anzahl")) fragen = fragen.slice(0, Number(wert("anzahl")));
if (!fragen.length) throw new Error("Keine Fragen ausgewählt.");

const adressat = (an: Frage["an"]) => (an === "A" ? "alle" : agenten.find((a) => a.kuerzel === an)!.id);

function bauePrompt(f: Frage) {
  const text = f.frage.replace(/\s*\(Ausschnitt A\db?\)\s*$/, "");
  const uebersicht = istUebersichtsfrage(text);
  // Wie in der App: Bei einer Übersichtsfrage an "alle" antwortet nur ein Agent (bevorzugt der Vertriebsexperte)
  const an = uebersichtsAdressat(adressat(f.an), agenten.map((a) => a.id), uebersicht);
  const gefragt = agenten.filter((a) => an === "alle" || a.id === an);
  const system = `${baueSystemPrompt({ gesamt: gesamt!, briefing, agenda, laeuft: f.block, agenten, an })}\n\n${formatHinweis(gefragt, an, uebersicht)}`;
  const ausschnitt = langesTranskript ? fuelltext() : f.typ === "T" ? ausschnitte[ausschnittVon(f)] : undefined;
  const nutzer = frageNachricht(text, an, agenten.find((a) => a.id === an)?.name ?? "", ausschnitt);
  return { an, gefragt, system, nutzer, uebersicht };
}

// ── Trockenlauf: nur Größen zeigen ──
if (flag("trocken")) {
  console.log(`Namen in der Prüfliste: ${namen.length}${namen.length ? "" : " (docs/wissen fehlt: Namensprüfung läuft ohne Liste)"}`);
  for (const f of fragen.slice(0, 5)) {
    const p = bauePrompt(f);
    console.log(`${f.id} an=${p.an}: System ${p.system.length} Zeichen, Nutzer ${p.nutzer.length} Zeichen`);
  }
  console.log(`${fragen.length} Fragen ausgewählt. Kein Aufruf des Sprachmodells (--trocken).`);
  process.exit(0);
}
if (config.mock || !config.llm.schluessel) throw new Error("Kein Sprachmodell konfiguriert (.env: MOCK_MODE=false, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL).");

// ── Sprachmodell aufrufen (gleiche Anpassungen wie src/anbieter/llm.ts: Temperatur, max_completion_tokens, JSON-Modus) ──
const anpassung = { ohneTemperatur: false, maxCompletion: false, ohneJsonModus: false, ohneDenktiefe: false };
async function frageModell(system: string, nutzer: string, maxTokens = 4000): Promise<{ text: string; ms: number }> {
  const start = Date.now();
  for (let versuch = 0; versuch < 6; versuch++) {
    const body: Record<string, unknown> = { model: modell, messages: [{ role: "system", content: system }, { role: "user", content: nutzer }] };
    if (!anpassung.ohneJsonModus) body.response_format = { type: "json_object" };
    if (!anpassung.ohneTemperatur) body.temperature = 0.2;
    if (config.llm.denktiefe && !anpassung.ohneDenktiefe) body.reasoning_effort = config.llm.denktiefe;
    body[anpassung.maxCompletion ? "max_completion_tokens" : "max_tokens"] = maxTokens;
    const res = await fetch(config.llm.basisUrl + config.llm.pfad, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.llm.schluessel}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (res.status === 400) {
      const fehler = await res.text();
      // Parallel laufende Anfragen können dieselbe Anpassung schon gesetzt haben: dann einfach noch einmal senden
      if (/temperature/i.test(fehler)) anpassung.ohneTemperatur = true;
      else if (/max_tokens|max_completion_tokens/i.test(fehler)) anpassung.maxCompletion = true;
      else if (/reasoning_effort/i.test(fehler)) anpassung.ohneDenktiefe = true;
      else if (/response_format/i.test(fehler)) anpassung.ohneJsonModus = true;
      else throw new Error(`Sprachmodell: HTTP 400 ${fehler.slice(0, 300)}`);
      continue;
    }
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 2000 * (versuch + 1))); continue; }
    if (!res.ok) throw new Error(`Sprachmodell: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
    // Broki liefert gelegentlich einen leeren oder abgebrochenen Antworttext (HTTP 200): dann noch einmal fragen
    let daten: { choices?: { message?: { content?: string }; finish_reason?: string }[] };
    try { daten = JSON.parse(await res.text()); } catch { await new Promise((r) => setTimeout(r, 1000)); continue; }
    if (daten.choices?.[0]?.finish_reason === "length" && maxTokens < 24_000) { maxTokens *= 3; continue; }
    return { text: daten.choices?.[0]?.message?.content ?? "", ms: Date.now() - start };
  }
  throw new Error("Sprachmodell: keine brauchbare Antwort nach mehreren Versuchen.");
}

type Ergebnis = { frage: Frage; an: string; antworten: Antwort[]; verstoesse: Verstoss[]; ms: number; fehler?: string };

async function lauf(f: Frage): Promise<Ergebnis> {
  const p = bauePrompt(f);
  try {
    let roh = await frageModell(p.system, p.nutzer);
    let antworten: Antwort[];
    try { antworten = leseAntworten(leseJson(roh.text)); } catch { roh = await frageModell(p.system, p.nutzer); try { antworten = leseAntworten(leseJson(roh.text)); } catch (e) { throw new Error(`${(e as Error).message} – Antworttext (${roh.text.length} Zeichen): ${JSON.stringify(roh.text.slice(0, 200))}`); } }
    const kontext = `${p.system}\n${p.nutzer}`;
    const erlaubt = antworten.filter((a) => p.gefragt.some((g) => g.id === a.rolle));
    const verstoesse: Verstoss[] = [];
    if (erlaubt.length !== p.gefragt.length) verstoesse.push({ regel: "format", text: `${erlaubt.length} Antworten, erwartet ${p.gefragt.length}` });
    for (const a of erlaubt) for (const v of pruefeAntwort({ text: a.text, rolle: a.rolle, an: p.an, namen, kontext, erlaubteNamen: p.system, uebersicht: p.uebersicht })) verstoesse.push({ ...v, text: `${a.rolle}: ${v.text}` });
    return { frage: f, an: p.an, antworten: erlaubt, verstoesse, ms: roh.ms };
  } catch (e) {
    return { frage: f, an: p.an, antworten: [], verstoesse: [{ regel: "format", text: "Fehler beim Aufruf" }], ms: 0, fehler: `${(e as Error).message}${(e as { cause?: { code?: string; message?: string } }).cause ? ` (${(e as { cause: { code?: string; message?: string } }).cause.code ?? (e as { cause: { message?: string } }).cause.message})` : ""}` };
  }
}

// ── Lauf mit begrenzter Parallelität ──
console.log(`${fragen.length} Fragen, Modell ${modell}, ${parallel} parallel. Namensliste: ${namen.length} Einträge.`);
const ergebnisse: Ergebnis[] = new Array(fragen.length);
let naechste = 0;
let fertig = 0;
await Promise.all(Array.from({ length: Math.min(parallel, fragen.length) }, async () => {
  while (naechste < fragen.length) {
    const i = naechste++;
    ergebnisse[i] = await lauf(fragen[i]!);
    fertig++;
    process.stdout.write(`\r${fertig}/${fragen.length}`);
  }
}));
console.log("");

// ── Bericht ──
const rolleName = (id: string) => agenten.find((a) => a.id === id)?.name ?? id;
const stempel = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
const zielOrdner = path.join(wurzel, "data", "testergebnisse");
fs.mkdirSync(zielOrdner, { recursive: true });
const sauber = ergebnisse.filter((e) => !e.verstoesse.length).length;
const nachRegel = (regel: string) => ergebnisse.filter((e) => e.verstoesse.some((v) => v.regel === regel)).length;
const mittel = Math.round(ergebnisse.reduce((s, e) => s + e.ms, 0) / ergebnisse.length);
const langsam = Math.max(...ergebnisse.map((e) => e.ms));

const md: string[] = [];
md.push(`# Agententest ${stempel}`, "", `Modell ${modell} · ${ergebnisse.length} Fragen · ordner \`${path.relative(wurzel, ordner)}\``, "");
md.push("## Automatische Prüfung", "", `**${sauber} von ${ergebnisse.length} ohne Verstoß.** Muss 100 % sein.`, "");
md.push("| Regel | Fragen mit Verstoß |", "|---|---|", ...["name", "laenge", "markdown", "zahl", "nummer", "format"].map((r) => `| ${r} | ${nachRegel(r)} |`), "");
md.push(`Antwortzeit je Frage: Mittel ${(mittel / 1000).toFixed(1)} s, längste ${(langsam / 1000).toFixed(1)} s.`, "");
const schlecht = ergebnisse.filter((e) => e.verstoesse.length);
if (schlecht.length) {
  md.push("### Verstöße", "");
  for (const e of schlecht) md.push(`- **${e.frage.id}**: ${e.verstoesse.map((v) => `${v.regel} (${v.text})`).join("; ")}${e.fehler ? ` – ${e.fehler}` : ""}`);
  md.push("");
}
md.push("## Antworten zum Bewerten", "", "Je Antwort 0–2 Punkte: trifft · Brodos-Bezug · Mehrwert · Ehrlichkeit · Rolle. Unter 7 von 10: Ursache notieren (Lücke im Wissen, zu allgemein, Prompt, Überschuss).", "");
let block = "";
for (const e of ergebnisse) {
  if (e.frage.block !== block) { block = e.frage.block; md.push(`### Block ${block}: ${agenda[Number(block.slice(1)) - 1] ?? ""}`, ""); }
  md.push(`#### ${e.frage.id} · an ${e.an === "alle" ? "alle" : rolleName(e.an)} · Typ ${e.frage.typ}`, "", `**Frage:** ${e.frage.frage}`, "", `*Prüfpunkt:* ${e.frage.pruefpunkt}`, "");
  if (!e.antworten.length) md.push(`> Keine Antwort${e.fehler ? `: ${e.fehler}` : ""}`, "");
  for (const a of e.antworten) md.push(`- **${rolleName(a.rolle)}:** ${a.text}`);
  if (e.verstoesse.length) md.push("", `⚠ ${e.verstoesse.map((v) => `${v.regel}: ${v.text}`).join("; ")}`);
  md.push("", "Bewertung: trifft [ ] Brodos [ ] Mehrwert [ ] ehrlich [ ] Rolle [ ] · Ursache: –", "");
}
const datei = path.join(zielOrdner, `lauf-${stempel}`);
fs.writeFileSync(`${datei}.md`, md.join("\n"));
fs.writeFileSync(`${datei}.json`, JSON.stringify({ modell, stempel, ergebnisse: ergebnisse.map((e) => ({ id: e.frage.id, an: e.an, antworten: e.antworten, verstoesse: e.verstoesse, ms: e.ms, fehler: e.fehler })) }, null, 2));
console.log(`Bericht: ${path.relative(wurzel, datei)}.md`);
console.log(`Ohne Verstoß: ${sauber}/${ergebnisse.length} · Namen: ${nachRegel("name")} · Länge: ${nachRegel("laenge")} · Markdown: ${nachRegel("markdown")} · Zahlen: ${nachRegel("zahl")} · Nummern/Kürzel: ${nachRegel("nummer")} · Format/Fehler: ${nachRegel("format")}`);
