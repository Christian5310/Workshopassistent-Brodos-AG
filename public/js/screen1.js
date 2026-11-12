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
      merke(false);
      await aufnahme.stopp(); // letzter, angebrochener Schnipsel geht noch raus
      await sende("/api/regie/pause");
    } else {
      if (quelle === "mikro") await aufnahme.mikrofonOeffnen(); // erst fragen, dann einschalten
      merke(true);
      await sende("/api/regie/start");
    }
  } catch (fehler) {
    mikrofehler.textContent = fehler.message;
  }
});

function zeige({ protokoll, status }) {
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
    protokoll.todos.map((t) => {
      const inhalt = el("div", "text", t.text);
      const meta = el("span", "meta");
      meta.append("Wer: ", el("b", "", t.owner), "  ·  Bis: ", el("b", "", t.frist));
      const rahmen = el("div");
      rahmen.append(inhalt, meta);
      return zeile(t.id, t.status, rahmen);
    }),
    "Noch keine To-dos.",
  );
  const offen = protokoll.todos.filter((t) => t.status === "offen").length;
  document.querySelector("#todo-zahl").textContent = protokoll.todos.length ? `${offen} offen` : "";

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
