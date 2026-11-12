import { Aufnahme } from "./aufnahme.js";
import { el, sende, verbinde, zeigeStatus } from "./common.js";

// Merkt sich, was schon gezeigt wurde: so erkennen wir Neues und frisch Erledigtes für die Animation.
const bekannt = new Map();
let ersterAufbau = true;

function zeile(schluessel, status, inhalt, { box = true, marke = "" } = {}) {
  const li = el("li", status);
  const vorher = bekannt.get(schluessel);
  if (!ersterAufbau && vorher === undefined) li.classList.add("neu");
  if (!ersterAufbau && vorher !== undefined && vorher !== status && (status === "erledigt" || status === "beantwortet")) {
    li.classList.add("frisch", "neu");
  }
  bekannt.set(schluessel, status);
  if (box) li.append(el("span", "box"));
  if (marke) li.append(el("span", "marke", marke));
  li.append(inhalt);
  return li;
}

function fuelle(id, eintraege, leerText) {
  const liste = document.querySelector(id);
  liste.replaceChildren(...(eintraege.length ? eintraege : [el("li", "leer", leerText)]));
  const neu = liste.querySelector(".neu");
  if (neu) neu.scrollIntoView({ block: "nearest" });
}

// An/Aus-Schalter: der Assistent hört nur zu, solange er eingeschaltet ist.
const schalter = document.querySelector("#schalter");
let an = false;
let quelle = "timer";
const pegel = document.querySelector("#pegel");
const mikrofehler = document.querySelector("#mikrofehler");

// Dieses Gerät ist das Aufnahmegerät, sobald hier eingeschaltet wurde (übersteht ein Neuladen der Seite).
const MERKER = "broki-live-aufnahmegeraet";
const merke = (wert) => { try { wert ? localStorage.setItem(MERKER, "1") : localStorage.removeItem(MERKER); } catch {} };
const istAufnahmegeraet = () => { try { return localStorage.getItem(MERKER) === "1"; } catch { return false; } };

const aufnahme = new Aufnahme({
  beiPegel: (wert) => (pegel.firstElementChild.style.width = `${Math.round(wert * 100)}%`),
  beiFehler: (text) => (mikrofehler.textContent = text),
});

schalter.addEventListener("click", async () => {
  mikrofehler.textContent = "";
  try {
    if (an) {
      const wahl = await frageAblage();
      if (wahl === "abbrechen") return;
      merke(false);
      await aufnahme.stopp(); // letzter, angebrochener Schnipsel geht noch raus
      await sende("/api/regie/pause");
      if (wahl === "ablegen") await sende("/api/todos/ablegen", { name: ablageName.value });
    } else {
      if (quelle === "mikro") await aufnahme.mikrofonOeffnen(); // erst fragen, dann einschalten
      merke(true);
      await sende("/api/regie/start");
    }
  } catch (fehler) {
    mikrofehler.textContent = fehler.message;
  }
});

// ── Beim Ausschalten: To-dos der aktuellen Liste unter einer Kategorie ablegen ──
const ablage = document.querySelector("#ablage");
const ablageName = document.querySelector("#ablage-name");
let stand = null;

function frageAblage() {
  const aktuell = stand.todos.filter((t) => !t.gruppe);
  if (!aktuell.length) return Promise.resolve("nur-aus");
  const punkt = stand.agenda.find((a) => a.status === "läuft") ?? stand.agenda.findLast((a) => a.status === "erledigt");
  const kategorien = new Set(stand.todos.map((t) => t.gruppe).filter(Boolean));
  ablageName.value = punkt && !kategorien.has(punkt.titel) ? punkt.titel : `Block ${kategorien.size + 1}`;
  document.querySelector("#ablage-text").textContent =
    `Die aktuelle Liste hat ${aktuell.length} To-do${aktuell.length === 1 ? "" : "s"}. Du kannst sie unter einer Kategorie ablegen, dann startet die Liste nach der Pause leer. Abgelegte To-dos bleiben aufklappbar und im Protokoll.`;
  ablage.returnValue = "abbrechen";
  ablage.showModal();
  ablageName.select();
  return new Promise((fertig) => ablage.addEventListener("close", () => fertig(ablage.returnValue === "ablegen" && !ablageName.value.trim() ? "nur-aus" : ablage.returnValue), { once: true }));
}

// ── Kleines Transkript-Fenster unter der Agenda (ein-/ausblendbar) ──
const tKnopf = document.querySelector("#transkript-knopf");
const tKarte = document.querySelector("#transkript-karte");
let tOffen = false;
let tStand = null;
try { tOffen = localStorage.getItem("broki-live-transkript") === "1"; } catch {}

async function zeigeTranskript(erzwingen = false) {
  tKarte.hidden = !tOffen;
  tKnopf.classList.toggle("aktiv", tOffen);
  tKnopf.setAttribute("aria-pressed", String(tOffen));
  if (!tOffen || (!erzwingen && tStand === letzterZyklus)) return;
  tStand = letzterZyklus;
  const abschnitte = (await (await fetch("/api/transcript")).json()).slice(-6);
  const ziel = document.querySelector("#transkript");
  ziel.replaceChildren(...(abschnitte.length ? abschnitte.map((a, i) => el("p", i === abschnitte.length - 1 ? "neuester" : "", a.text)) : [el("p", "leer", "Noch kein Transkript.")]));
  ziel.scrollTop = ziel.scrollHeight;
}
let letzterZyklus = null;
tKnopf.addEventListener("click", () => {
  tOffen = !tOffen;
  try { localStorage.setItem("broki-live-transkript", tOffen ? "1" : "0"); } catch {}
  zeigeTranskript(true);
});

// ── Abgelegte Kategorien: eingeklappt über der aktuellen Liste ──
const offeneGruppen = new Set();
function zeigeGruppen(todos) {
  const ziel = document.querySelector("#gruppen");
  const namen = [...new Set(todos.map((t) => t.gruppe).filter(Boolean))];
  ziel.replaceChildren(
    ...namen.map((name) => {
      const eintraege = todos.filter((t) => t.gruppe === name);
      const offen = eintraege.filter((t) => t.status === "offen").length;
      const d = el("details", "gruppe");
      d.open = offeneGruppen.has(name);
      d.addEventListener("toggle", () => (d.open ? offeneGruppen.add(name) : offeneGruppen.delete(name)));
      const kopf = el("summary");
      kopf.append(el("b", "", name), el("span", "", `${eintraege.length} To-do${eintraege.length === 1 ? "" : "s"} · ${offen} offen`));
      const liste = el("ul", "liste");
      for (const t of eintraege) {
        const li = el("li", t.status);
        li.append(el("span", "box"), el("span", "text", `${t.text} · ${t.owner} · ${t.frist}`));
        liste.append(li);
      }
      const zurueck = el("button", "zweit klein", "Zurück in die aktuelle Liste");
      zurueck.addEventListener("click", () => sende("/api/todos/ablegen", { name, zurueck: true }).catch(console.warn));
      d.append(kopf, liste, zurueck);
      return d;
    }),
  );
}

function zeige({ protokoll, status }) {
  stand = protokoll;
  letzterZyklus = status.letzterZyklus;
  zeigeTranskript();
  zeigeGruppen(protokoll.todos);
  const aktuelleTodos = protokoll.todos.filter((t) => !t.gruppe);
  zeigeStatus(status);
  an = status.aufnahme;
  schalter.textContent = an ? "Assistent ist an" : "Assistent ist aus";
  schalter.classList.toggle("aktiv", an);
  schalter.setAttribute("aria-pressed", String(an));

  // Aufnahme folgt dem Serverstatus: läuft nur auf dem Aufnahmegerät und nur, wenn echte Schnipsel gefragt sind.
  quelle = status.quelle;
  const sollAufnehmen = an && quelle === "mikro" && istAufnahmegeraet();
  if (sollAufnehmen && !aufnahme.laeuft) aufnahme.start(status.zyklusSekunden).catch((f) => (mikrofehler.textContent = f.message));
  if (!sollAufnehmen && aufnahme.laeuft) aufnahme.stopp();
  pegel.hidden = !aufnahme.laeuft && !sollAufnehmen;
  if (an && quelle === "mikro" && !istAufnahmegeraet()) mikrofehler.textContent ||= "Der Assistent läuft auf einem anderen Gerät. Dieses Gerät zeigt nur an.";
  if (!an && mikrofehler.textContent.startsWith("Der Assistent läuft auf")) mikrofehler.textContent = "";

  fuelle("#agenda", protokoll.agenda.map((a) => zeile(a.id, a.status, el("span", "text", a.titel))), "Keine Agenda hinterlegt.");

  fuelle(
    "#todos",
    aktuelleTodos.map((t) => {
      const inhalt = el("div", "text", t.text);
      const meta = el("span", "meta");
      meta.append("Wer: ", el("b", "", t.owner), "  ·  Bis: ", el("b", "", t.frist));
      const rahmen = el("div");
      rahmen.append(inhalt, meta);
      return zeile(t.id, t.status, rahmen);
    }),
    protokoll.todos.length ? "Aktuelle Liste ist leer." : "Noch keine To-dos.",
  );
  const offen = aktuelleTodos.filter((t) => t.status === "offen").length;
  document.querySelector("#todo-zahl").textContent = aktuelleTodos.length ? `${offen} offen` : "";

  // Vorschläge: unsichere To-dos, die ein Mensch übernimmt oder verwirft
  document.querySelector("#vorschlag-karte").hidden = !protokoll.vorschlaege.length;
  fuelle(
    "#vorschlaege",
    protokoll.vorschlaege.map((v) => {
      const rahmen = el("div", "vorschlag");
      const text = el("div", "text", v.text);
      const knoepfe = el("div", "reihe");
      for (const [aktion, titel, klasse] of [["annehmen", "✓ Übernehmen", ""], ["verwerfen", "✕ Verwerfen", "zweit"]]) {
        const knopf = el("button", klasse, titel);
        knopf.addEventListener("click", () => sende(`/api/vorschlag/${v.id}/${aktion}`).catch(console.warn));
        knoepfe.append(knopf);
      }
      rahmen.append(text, knoepfe);
      return zeile(v.id, "vorschlag", rahmen, { box: false, marke: "?" });
    }),
    "",
  );

  fuelle(
    "#entscheidungen",
    protokoll.entscheidungen.map((e) => zeile(e.id, "fest", el("span", "text", e.text), { box: false, marke: "→" })),
    "Noch keine Entscheidungen.",
  );
  fuelle(
    "#fragen",
    protokoll.offene_fragen.map((f) => zeile(f.id, f.status, el("span", "text", f.text), { box: false, marke: f.status === "beantwortet" ? "✓" : "?" })),
    "Keine offenen Fragen.",
  );

  ersterAufbau = false;
}

verbinde(zeige);
