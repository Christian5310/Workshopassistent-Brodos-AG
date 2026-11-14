// App-Rahmen: bleibt stehen, während der Inhalt wechselt. Er hält das Mikrofon – deshalb läuft die Aufnahme
// weiter, wenn man vom Assistenten zu Agenten, Archiv oder Admin wechselt.
import { Aufnahme } from "./aufnahme.js";
import { sende, verbinde } from "./common.js";

const $ = (id) => document.querySelector(id);

// Zutritt nur mit bestätigtem Einverständnis der Teilnehmenden (Bildschirm nach dem Eintreten). Gilt je Browser-Tab.
const einwilligung = (() => { try { return sessionStorage.getItem("broki-einwilligung"); } catch { return null; } })();
if (!einwilligung) location.replace("/einwilligung");
// Bereiche im Fenster. "assistent" und "agenten" gehören zum Abhalten eines Meetings oder Workshops
// und haben keinen eigenen Punkt in der Navigation oben.
const BEREICHE = { start: "/uebersicht", meeting: "/uebersicht?b=meeting", workshop: "/workshops", assistent: "/screen1", agenten: "/screen2", archiv: "/archiv", admin: "/admin", regie: "/regie" };
const TITEL = { start: "Start", meeting: "Meeting", workshop: "Workshop", assistent: "Meeting Assistent", agenten: "Agenten", archiv: "Archiv", admin: "Admin", regie: "Regie" };
const ALT = { uebersicht: "start", workshops: "workshop" }; // frühere Namen
let gehoertZuWorkshop = false;

function zeigeBereich() {
  let bereich = location.hash.slice(1);
  if (bereich in ALT) return void location.replace(`#${ALT[bereich]}`);
  if (!(bereich in BEREICHE)) bereich = "start";
  // Assistent und Agenten zählen zu dem, was gerade abgehalten wird: Meeting oder Workshop.
  const navPunkt = bereich === "assistent" || bereich === "agenten" ? (gehoertZuWorkshop ? "workshop" : "meeting") : bereich;
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
window.addEventListener("hashchange", zeigeBereich);
zeigeBereich();

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
  beiPegel: (wert) => ($("#pegel").firstElementChild.style.width = `${Math.round(wert * 100)}%`),
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

verbinde((stand) => {
  status = stand.status;
  if (gehoertZuWorkshop !== (stand.workshop !== null)) { gehoertZuWorkshop = stand.workshop !== null; zeigeBereich(); }
  quelle = status.quelle;
  $("#mock").hidden = !status.mock;

  const soll = status.aufnahme && quelle === "mikro" && istAufnahmegeraet();
  aufnahme.sekunden = status.zyklusSekunden;
  if (soll && !aufnahme.laeuft) aufnahme.start(status.zyklusSekunden).catch((f) => melde(f.message));
  if (!soll && aufnahme.laeuft) aufnahme.stopp();

  const fremd = "Die Aufnahme läuft auf einem anderen Gerät. Dieses Gerät zeigt nur an.";
  if (status.aufnahme && quelle === "mikro" && !istAufnahmegeraet()) $("#rahmenhinweis").textContent ||= fremd;
  if (!status.aufnahme && $("#rahmenhinweis").textContent === fremd) melde("");
  zeigeAufnahme();
});

/** Anzeige in der Kopfzeile: ist in jedem Bereich sichtbar, damit klar bleibt, dass aufgenommen wird. */
function zeigeAufnahme() {
  if (!status) return;
  const laeuft = status.aufnahme;
  $("#aufnahme").classList.toggle("laeuft", laeuft);
  $("#pegel").hidden = !aufnahme.laeuft;
  const rest = Math.max(0, Math.ceil((aufnahme.naechsterVersand - Date.now()) / 1000));
  $("#aufnahme").title = aufnahme.laeuft ? `Der laufende Abschnitt wird in ${rest} Sekunden gesendet.` : "";
  $("#aufnahme-text").textContent = !laeuft
    ? status.letzterZyklus ? "Pausiert" : "Keine Aufnahme"
    : aufnahme.laeuft ? `Aufnahme · ${rest} s` : "Aufnahme läuft";
}
setInterval(zeigeAufnahme, 500);

// Beim Schließen des Tabs warnen, solange aufgenommen wird.
window.addEventListener("beforeunload", (ereignis) => {
  if (aufnahme.laeuft) ereignis.preventDefault();
});
