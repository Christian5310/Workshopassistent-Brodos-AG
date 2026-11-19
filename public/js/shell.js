// App-Rahmen: bleibt stehen, während der Inhalt wechselt. Er hält das Mikrofon – deshalb läuft die Aufnahme
// weiter, wenn man vom Assistenten zu Agenten, Archiv oder Admin wechselt.
import { Aufnahme } from "./aufnahme.js";
import { sende, verbinde } from "./common.js";
import { starteMerlin } from "./merlin.js";

const $ = (id) => document.querySelector(id);

// Zutritt nur mit bestätigtem Einverständnis der Teilnehmenden (Bildschirm nach dem Eintreten). Gilt je Browser-Tab.
const einwilligung = (() => { try { return sessionStorage.getItem("broki-einwilligung"); } catch { return null; } })();
if (!einwilligung) location.replace("/einwilligung");
// Bereiche im Fenster. "assistent" und "agenten" gehören zum Abhalten eines Meetings oder Workshops
// und haben keinen eigenen Punkt in der Navigation oben.
const BEREICHE = { start: "/uebersicht", meeting: "/uebersicht?b=meeting", workshop: "/workshops", assistent: "/screen1", agenten: "/screen2", pinnwand: "/pinnwand", archiv: "/archiv", admin: "/admin", regie: "/regie" };
const TITEL = { start: "Start", meeting: "Meeting", workshop: "Workshop", assistent: "Meeting Assistent", agenten: "Agenten", pinnwand: "Pinnwand", archiv: "Archiv", admin: "Admin", regie: "Regie" };
const ALT = { uebersicht: "start", workshops: "workshop" }; // frühere Namen
let gehoertZuWorkshop = false;

function zeigeBereich() {
  let bereich = location.hash.slice(1);
  if (bereich in ALT) return void location.replace(`#${ALT[bereich]}`);
  if (!(bereich in BEREICHE)) bereich = "start";
  // Assistent und Agenten zählen zu dem, was gerade abgehalten wird: Meeting oder Workshop.
  const navPunkt = bereich === "pinnwand" ? "workshop" : bereich === "assistent" || bereich === "agenten" ? (gehoertZuWorkshop ? "workshop" : "meeting") : bereich;
  for (const a of document.querySelectorAll(".app-kopf nav a")) {
    if (a.dataset.nav === navPunkt) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  const rahmen = $("#inhalt");
  if (rahmen.dataset.bereich !== bereich) {
    rahmen.dataset.bereich = bereich;
    rahmen.src = BEREICHE[bereich];
  }
  document.title = `${TITEL[bereich]} · BroKI`;
}
window.addEventListener("hashchange", () => { zeigeBereich(); merlinNavi?.bereichGewechselt(); if (status) zeigeRueckweg(); });
zeigeBereich();
/** Wechselt den Bereich; neuLaden lädt die Ansicht auch dann neu, wenn sie schon offen ist (z. B. für Merlins Aufträge). */
function geheZu(ziel, neuLaden = false) {
  if (neuLaden) $("#inhalt").dataset.bereich = "";
  if (location.hash.slice(1) === ziel) zeigeBereich();
  else location.hash = ziel;
}
const aktuellerBereich = () => $("#inhalt").dataset.bereich || "start";
let merlinNavi = null;

// ── Präsentationsmodus: Fenster füllt den Bildschirm, Schrift wächst mit (für den Beamer) ──
const pKnopf = $("#praesentation");
function praesentation(an) {
  document.documentElement.classList.toggle("praesentation", an);
  $("#inhalt").contentDocument?.documentElement.classList.toggle("praesentation", an);
  pKnopf.setAttribute("aria-pressed", String(an));
  pKnopf.title = an ? "Präsentationsmodus beenden" : "Präsentationsmodus: Fenster und Schrift für den Beamer vergrößern";
  try { localStorage.setItem("merlin-praesentation", an ? "1" : "0"); } catch {}
}
pKnopf.addEventListener("click", () => {
  const an = !document.documentElement.classList.contains("praesentation");
  praesentation(an);
  if (an) document.documentElement.requestFullscreen?.().catch(() => {});
  else if (document.fullscreenElement) document.exitFullscreen?.();
});
try { if (localStorage.getItem("merlin-praesentation") === "1") praesentation(true); } catch {}

// ── Aufnahme: lebt hier im Rahmen und folgt dem Status des Servers ──
const melde = (text) => ($("#rahmenhinweis").textContent = text);
const aufnahme = new Aufnahme({
  // Mikrofon-Pegel: der rote Punkt bekommt einen Schein, je lauter, desto größer
  beiPegel: (wert) => $("#aufnahme").style.setProperty("--pegel", wert.toFixed(2)),
  beiFehler: melde,
});

// Dieses Gerät ist das Aufnahmegerät, sobald hier gestartet wurde (übersteht ein Neuladen der Seite).
const MERKER = "broki-live-aufnahmegeraet";
const merke = (wert) => { try { wert ? localStorage.setItem(MERKER, "1") : localStorage.removeItem(MERKER); } catch {} };
const istAufnahmegeraet = () => { try { return localStorage.getItem(MERKER) === "1"; } catch { return false; } };

let quelle = "timer";
let status = null;

/** Steuerung für die Ansichten im Fenster (siehe merlin() in common.js). */
window.merlin = {
  aufnahme,
  async starten() {
    melde("");
    if (quelle === "mikro") await aufnahme.mikrofonOeffnen(); // erst fragen, dann starten
    merke(true);
    await sende("/api/regie/start", { einwilligung }); // der Server dokumentiert die Bestätigung am Meeting
  },
  /** Hält nur die Aufnahme an. Der angebrochene Abschnitt geht noch raus, sonst bleibt alles erhalten. */
  async pausieren() {
    merke(false);
    await aufnahme.stopp();
    await sende("/api/regie/pause");
  },
};

// ── Merlin: schwebt außerhalb des Fensters, navigiert, stimmt ein, erinnert an Pausen ──
merlinNavi = starteMerlin({ gehe: geheZu, bereich: aktuellerBereich, steuerung: window.merlin, istAufnahmegeraet: () => istAufnahmegeraet() });
window.merlin.navigator = merlinNavi.schnittstelle;

let meetingOffen = false;
let meetingName = "";
/** Ein Fehler in einem Teil soll die anderen Anzeigen (Aufnahme, Rückweg) nicht blockieren. */
const sicher = (name, aufgabe) => { try { aufgabe(); } catch (fehler) { console.error(`BroKI Rahmen (${name}):`, fehler); } };

verbinde((stand) => {
  status = stand.status;
  meetingOffen = stand.tag !== null;
  meetingName = stand.workshop?.name ?? stand.tag?.name ?? "";
  if (gehoertZuWorkshop !== (stand.workshop !== null)) { gehoertZuWorkshop = stand.workshop !== null; sicher("Bereich", zeigeBereich); }
  sicher("Rückweg", zeigeRueckweg);
  sicher("Merlin", () => merlinNavi.aktualisiere(stand));
  quelle = status.quelle;
  $("#mock").hidden = !status.mock;

  // Mikrofon nur mit geöffnetem Meeting (Sicherung, falls der Server-Stand kurz nicht passt)
  const soll = status.aufnahme && meetingOffen && quelle === "mikro" && istAufnahmegeraet();
  aufnahme.sekunden = status.zyklusSekunden;
  if (soll && !aufnahme.laeuft) aufnahme.start(status.zyklusSekunden).catch((f) => melde(f.message));
  if (!soll && aufnahme.laeuft) aufnahme.stopp();

  const fremd = "Die Aufnahme läuft auf einem anderen Gerät. Dieses Gerät zeigt nur an.";
  if (status.aufnahme && quelle === "mikro" && !istAufnahmegeraet()) $("#rahmenhinweis").textContent ||= fremd;
  if (!status.aufnahme && $("#rahmenhinweis").textContent === fremd) melde("");
  sicher("Aufnahme", zeigeAufnahme);
  sicher("Rückweg", zeigeRueckweg);
});

// ── Zurück ins laufende Meeting: bei laufender Aufnahme ist "Meeting" bzw. "Workshop" oben gelb und führt direkt hin ──
function zeigeRueckweg() {
  const laeuft = status?.aufnahme === true;
  const ziel = gehoertZuWorkshop ? "workshop" : "meeting";
  const imMeeting = ["assistent", "agenten"].includes(aktuellerBereich());
  for (const a of document.querySelectorAll(".app-kopf nav a")) {
    // Offenes Meeting (läuft oder pausiert), solange man woanders ist: hervorgehoben, Klick führt zurück.
    // Nach "Meeting schließen" ist kein Meeting mehr offen und die Navigation wieder normal.
    const an = meetingOffen && a.dataset.nav === ziel && (laeuft || !imMeeting);
    a.classList.toggle("laeuft", an && laeuft);
    a.classList.toggle("offen", an && !laeuft);
    if (an) a.title = `Zurück zum ${laeuft ? "laufenden" : "geöffneten"} ${ziel === "workshop" ? "Workshop" : "Meeting"}${meetingName ? ` „${meetingName}“` : ""}`;
    else a.removeAttribute("title");
  }
  $("#aufnahme").classList.toggle("klickbar", meetingOffen);
  $("#aufnahme").tabIndex = meetingOffen ? 0 : -1;
  if (!laeuft) $("#aufnahme").title = meetingOffen ? "Zurück zum geöffneten Meeting" : "";
}
document.querySelector(".app-kopf nav").addEventListener("click", (e) => {
  const link = e.target.closest("a[data-nav]");
  if (!link) return;
  if (link.matches(".laeuft, .offen")) {
    e.preventDefault();
    return void geheZu("assistent");
  }
  // Klick auf den Bereich, in dem man schon ist: neu laden, also zurück zu seinem Anfang (z. B. Workshop-Auswahl)
  if (link.dataset.nav === aktuellerBereich()) {
    e.preventDefault();
    geheZu(link.dataset.nav, true);
  }
});
const zumLaufenden = () => { if (meetingOffen) geheZu("assistent"); };
$("#aufnahme").addEventListener("click", zumLaufenden);
$("#aufnahme").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); zumLaufenden(); } });

/** Anzeige in der Kopfzeile: ist in jedem Bereich sichtbar, damit klar bleibt, dass aufgenommen wird. */
function zeigeAufnahme() {
  if (!status) return;
  const laeuft = status.aufnahme;
  $("#app-bg").classList.toggle("aufnahme", laeuft);
  $("#aufnahme").classList.toggle("laeuft", laeuft);
  $("#countdown").hidden = !aufnahme.laeuft;
  const restMs = Math.max(0, aufnahme.naechsterVersand - Date.now());
  const rest = Math.ceil(restMs / 1000);
  // Countdown: der Balken wird bis zum Senden des Abschnitts kürzer
  $("#countdown").firstElementChild.style.width = `${Math.min(100, (restMs / (aufnahme.abschnittMs || 30000)) * 100)}%`;
  if (!aufnahme.laeuft) $("#aufnahme").style.setProperty("--pegel", "0");
  $("#aufnahme").title = laeuft ? `Zurück zum laufenden Meeting${aufnahme.laeuft ? ` · nächster Abschnitt in ${rest} s` : ""}` : "";
  $("#aufnahme-text").textContent = !laeuft
    ? status.letzterZyklus ? "Pausiert" : "Keine Aufnahme"
    : aufnahme.laeuft ? `Aufnahme · ${rest} s` : "Aufnahme läuft";
}
setInterval(() => { sicher("Aufnahme", zeigeAufnahme); sicher("Rückweg", zeigeRueckweg); }, 500);

// Stand der App-Dateien: steht beim Überfahren des Prototyp-Schilds. Zeigt, ob der Browser die neue Version geladen hat.
const STAND = "15.11.2026 · Rückweg v3";
document.querySelector(".badge.prototyp")?.setAttribute("title", `Stand: ${STAND}`);
console.info(`BroKI Rahmen, Stand ${STAND}`);

// Beim Schließen des Tabs warnen, solange aufgenommen wird.
window.addEventListener("beforeunload", (ereignis) => {
  if (aufnahme.laeuft) ereignis.preventDefault();
});
