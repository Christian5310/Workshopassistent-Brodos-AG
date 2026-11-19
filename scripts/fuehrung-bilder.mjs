// Erzeugt die Bildschirmfotos für die Führung durch die App (public/img/fuehrung/*.png).
// Aufruf: node scripts/fuehrung-bilder.mjs          (Chrome oder Edge muss installiert sein)
//
// Ablauf: Die App wird in einen Wegwerf-Ordner kopiert und dort im Mock-Modus mit Beispieldaten gestartet.
// Die echten Daten (data/) und die .env mit den Schlüsseln werden nicht angefasst und nicht kopiert.
// Danach fotografiert ein unsichtbarer Browser die Bereiche. Nach Änderungen an der Oberfläche einfach neu ausführen.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const wurzel = path.resolve(import.meta.dirname, "..");
const ausgabe = path.join(wurzel, "public", "img", "fuehrung");
const PORT = 3011;
const DEBUG_PORT = 9333;
const BREITE = 1366;
const HOEHE = 800;
const basis = `http://127.0.0.1:${PORT}`;
const warte = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = [
  process.env.CHROME_PFAD,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((p) => p && fs.existsSync(p));
if (!browser) throw new Error("Weder Chrome noch Edge gefunden. Pfad mit CHROME_PFAD angeben.");

// ── Wegwerf-Kopie der App ohne Daten und ohne .env ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "broki-fuehrung-"));
for (const n of ["src", "public", "config", "package.json", "tsconfig.json"]) fs.cpSync(path.join(wurzel, n), path.join(tmp, n), { recursive: true });
fs.symlinkSync(path.join(wurzel, "node_modules"), path.join(tmp, "node_modules"), "junction");
fs.rmSync(path.join(tmp, "public", "img", "fuehrung"), { recursive: true, force: true });

const prozesse = [];
const aufraeumen = () => {
  for (const p of prozesse) try { p.kill(); } catch {}
  try { fs.rmdirSync(path.join(tmp, "node_modules")); } catch {} // nur die Verknüpfung, nicht den Inhalt
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
};
process.on("exit", aufraeumen);

const server = spawn(process.execPath, [path.join(wurzel, "node_modules", "tsx", "dist", "cli.mjs"), "src/server.ts"], {
  cwd: tmp,
  env: { ...process.env, PORT: String(PORT), HOST: "127.0.0.1", MOCK_MODE: "true", MOCK_MIKRO: "false", MOCK_CHUNK_SECONDS: "3" },
  stdio: "ignore",
});
prozesse.push(server);
for (let i = 0; ; i++) {
  try { if ((await fetch(`${basis}/api/state`)).ok) break; } catch {}
  if (i > 100) throw new Error("Server startet nicht.");
  await warte(300);
}

const api = async (pfad, daten, methode = daten ? "POST" : "GET") => {
  const r = await fetch(basis + pfad, { method: methode, headers: { "Content-Type": "application/json" }, body: daten ? JSON.stringify(daten) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${pfad}: ${j.fehler ?? r.status}`);
  return j;
};

// ── Browser mit Fernsteuerung (Chrome DevTools Protocol) ──
const profil = fs.mkdtempSync(path.join(os.tmpdir(), "broki-profil-"));
prozesse.push(spawn(browser, ["--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profil}`, "--hide-scrollbars", "--no-first-run", `--window-size=${BREITE},${HOEHE}`, "about:blank"], { stdio: "ignore" }));
let ziel;
for (let i = 0; !ziel; i++) {
  try { ziel = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json()).find((t) => t.type === "page"); } catch {}
  if (i > 100) throw new Error("Browser startet nicht.");
  if (!ziel) await warte(300);
}
const ws = new WebSocket(ziel.webSocketDebuggerUrl);
await new Promise((ok, fehler) => { ws.onopen = ok; ws.onerror = fehler; });
let nr = 0;
const offen = new Map();
ws.onmessage = (n) => {
  const m = JSON.parse(n.data);
  if (m.id && offen.has(m.id)) { const { ok, fehler } = offen.get(m.id); offen.delete(m.id); m.error ? fehler(new Error(m.error.message)) : ok(m.result); }
};
const cdp = (methode, params = {}) => new Promise((ok, fehler) => { const id = ++nr; offen.set(id, { ok, fehler }); ws.send(JSON.stringify({ id, method: methode, params })); });
const auswerten = async (js) => (await cdp("Runtime.evaluate", { expression: js, awaitPromise: true, returnByValue: true })).result?.value;

await cdp("Page.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: BREITE, height: HOEHE, deviceScaleFactor: 1, mobile: false });
const gehe = async (url, ms = 1800) => { await cdp("Page.navigate", { url }); await warte(ms); };

// Einverständnis wie nach dem Eintreten bestätigen (sonst leitet der Rahmen um)
await gehe(`${basis}/einwilligung`, 800);
await auswerten(`sessionStorage.setItem("broki-einwilligung", new Date().toISOString())`);

fs.mkdirSync(ausgabe, { recursive: true });
const foto = async (name) => {
  // Mock- und Prototyp-Schild stören im Bild, die Aufnahme-Anzeige darf bleiben
  await auswerten(`for (const s of ["#mock", ".badge.prototyp"]) document.querySelector(s)?.style.setProperty("display", "none")`);
  // Im Fenster: oben beginnen, Mock-Hinweise weglassen
  await auswerten(`(() => {
    const d = document.querySelector("#inhalt")?.contentDocument;
    if (!d) return;
    d.defaultView.scrollTo(0, 0);
    for (const e of d.querySelectorAll("*")) if (e.scrollHeight > e.clientHeight + 5 && /auto|scroll/.test(d.defaultView.getComputedStyle(e).overflowY)) e.scrollTop = 0;
    for (const e of d.querySelectorAll(".hinweisband, .hinweis, .info, p, div")) if (e.children.length === 0 && /^Mock-Modus/.test(e.textContent.trim())) e.closest(".hinweisband, .hinweis, .info, div")?.style.setProperty("display", "none");
    const w = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) n.textContent = n.textContent.split("[Mock] ").join(""); // (keine Backslashes: sie gehen in der Vorlage verloren)
  })()`);
  await warte(300);
  const { data } = await cdp("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(path.join(ausgabe, `${name}.png`), Buffer.from(data, "base64"));
  console.log(`  ${name}.png`);
};
const bereich = async (hash, ms) => { await gehe(`${basis}/app#${hash}`, ms); };

try {
  console.log("Beispieldaten anlegen …");
  const heute = new Date().toLocaleDateString("sv-SE");
  // Einstellungen: das Beispiel soll zeigen, dass Agenten Wissen haben
  const meeting = await api("/api/tage", { name: "Jour fixe Vertrieb", datum: heute, agenda: ["Pipeline-Review", "Offene Angebote", "Nächste Schritte"] });
  const materialIds = [];
  const ws1 = await api("/api/workshops", {
    name: "Sales Agentic Workshop",
    datum: heute,
    agenda: ["Wo verlieren wir Chancen und Zeit?", "Idealer Arbeitstag", "Idealer Soll-Prozess", "Umsetzung und Aufgabenboard"],
    teilnehmer: [{ name: "Teilnehmer 1", rolle: "Vertrieb" }, { name: "Teilnehmer 2", rolle: "IT" }, { name: "Teilnehmer 3", rolle: "Controlling" }],
  });
  for (const [titel, text] of [
    ["Ist-Prozess Angebot", "Anfragen kommen per E-Mail und Telefon. Das Angebot wird in Excel gebaut und danach im CRM nachgetragen. Freigaben dauern oft mehrere Tage."],
    ["Problemübersicht", "Opportunities im CRM werden nicht konsequent verfolgt. Es gibt keine einheitlichen Stages. Folgeaktivitäten werden vergessen."],
    ["Praxisfall Verlängerung", "Ein Kunde mit 300 Geräten hat den Vertrag auslaufen lassen, weil niemand rechtzeitig angerufen hat."],
  ]) materialIds.push((await api(`/api/workshops/${ws1.id}/material`, { titel, art: "Dokument", person: "", text })).id);

  // Meeting Assistent und Agenten: Mock-Aufnahme laufen lassen, Fragen stellen
  console.log("Aufnahme und Agenten …");
  await api(`/api/tage/${meeting.id}/aktivieren`, {});
  await api("/api/regie/start", { einwilligung: new Date().toISOString() });
  await bereich("assistent", 1500);
  await warte(26_000); // Mock-Transkript und Protokoll füllen sich
  await foto("assistent");
  await api("/api/chat", { text: "Wo verlieren wir im Angebotsprozess die meiste Zeit?", an: "alle" });
  await bereich("agenten", 1500);
  await warte(6_000);
  await foto("agenten");
  await api("/api/regie/pause", {});
  await api("/api/meeting/schliessen", {});

  // Pinnwand gehört zu einem Workshop
  console.log("Pinnwand, Meeting-Auswahl, Admin …");
  for (const id of materialIds) await api(`/api/workshops/${ws1.id}/material/${id}/pin`, { pin: true }, "PATCH");
  await api(`/api/workshops/${ws1.id}/oeffnen`, {});
  await bereich("pinnwand", 6000);
  await foto("pinnwand");
  await api("/api/meeting/schliessen", {});

  await bereich("meeting", 1800);
  await foto("meeting");
  await bereich("admin", 1800);
  await foto("admin");
  console.log(`Fertig: ${ausgabe}`);
} finally {
  ws.close();
  aufraeumen();
}
process.exit(0);
