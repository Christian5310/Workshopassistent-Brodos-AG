import { Aufnahme } from "./aufnahme.js";
import { el, sende, verbinde, zeigeStatus } from "./common.js";

const $ = (id) => document.querySelector(id);

// Merkt sich, was schon gezeigt wurde: so erkennen wir Neues und frisch Erledigtes für die Animation.
const bekannt = new Map();
let ersterAufbau = true;
let stand = null; // aktuelles Protokoll
let tagId = null;
let an = false;
let quelle = "timer";
let letzterZyklus = null;

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
  const liste = $(id);
  liste.replaceChildren(...(eintraege.length ? eintraege : [el("li", "leer", leerText)]));
  const neu = liste.querySelector(".neu");
  if (neu) neu.scrollIntoView({ block: "nearest" });
}

const melde = (text) => ($("#mikrofehler").textContent = text);

// ── Tag auswählen: Alles Weitere (Transkript, To-dos, Ablage) läuft unter diesem Tag ──
const tagwahl = $("#tagwahl");
async function ladeTage() {
  const tage = await (await fetch("/api/tage")).json();
  tagwahl.replaceChildren(
    ...tage.map((t) => {
      const o = el("option", "", `${t.name} · ${new Date(`${t.datum}T12:00:00`).toLocaleDateString("de-DE")}`);
      o.value = t.id;
      return o;
    }),
  );
  tagwahl.value = tagId;
}
tagwahl.addEventListener("change", async () => {
  try {
    await sende(`/api/tage/${tagwahl.value}/aktivieren`);
  } catch (fehler) {
    melde(fehler.message);
    tagwahl.value = tagId;
  }
});

// ── Aufnahme und An/Aus-Schalter ──
const schalter = $("#schalter");
const pegel = $("#pegel");

// Dieses Gerät ist das Aufnahmegerät, sobald hier eingeschaltet wurde (übersteht ein Neuladen der Seite).
const MERKER = "broki-live-aufnahmegeraet";
const merke = (wert) => { try { wert ? localStorage.setItem(MERKER, "1") : localStorage.removeItem(MERKER); } catch {} };
const istAufnahmegeraet = () => { try { return localStorage.getItem(MERKER) === "1"; } catch { return false; } };

const aufnahme = new Aufnahme({
  beiPegel: (wert) => (pegel.firstElementChild.style.width = `${Math.round(wert * 100)}%`),
  beiFehler: melde,
});

schalter.addEventListener("click", async () => {
  melde("");
  try {
    if (an) {
      const wahl = await frageAblage();
      if (wahl === "abbrechen") return;
      merke(false);
      await aufnahme.stopp(); // letzter, angebrochener Schnipsel geht noch raus
      await sende("/api/regie/pause");
      if (wahl === "ablegen") await sende("/api/todos/ablegen");
    } else {
      if (quelle === "mikro") await aufnahme.mikrofonOeffnen(); // erst fragen, dann einschalten
      merke(true);
      await sende("/api/regie/start");
    }
  } catch (fehler) {
    melde(fehler.message);
  }
});

// Zeigt, dass wirklich aufgenommen wird: Sekunden bis der laufende Abschnitt gesendet wird.
setInterval(() => {
  const rest = Math.max(0, Math.ceil((aufnahme.naechsterVersand - Date.now()) / 1000));
  $("#countdown").textContent = aufnahme.laeuft ? `· Aufnahme läuft, sendet in ${rest} s` : "";
}, 500);

// ── Beim Ausschalten: To-dos der aktuellen Liste unter dem laufenden Agendapunkt ablegen ──
const ablage = $("#ablage");
const aktuellerPunkt = () => stand.agenda.find((a) => a.status === "läuft") ?? stand.agenda.findLast((a) => a.status === "erledigt");

function frageAblage() {
  const aktuell = stand.todos.filter((t) => !t.gruppe);
  if (!aktuell.length) return Promise.resolve("nur-aus");
  const kategorie = aktuellerPunkt()?.titel ?? "Ohne Agendapunkt";
  $("#ablage-text").textContent =
    `Die aktuelle Liste hat ${aktuell.length} To-do${aktuell.length === 1 ? "" : "s"}. Beim Ablegen wandern sie in die Kategorie „${kategorie}", und die Liste startet nach der Pause leer. Abgelegte To-dos bleiben aufklappbar und im Protokoll.`;
  ablage.returnValue = "abbrechen";
  ablage.showModal();
  return new Promise((fertig) => ablage.addEventListener("close", () => fertig(ablage.returnValue), { once: true }));
}

// ── Kleines Transkript-Fenster unter der Agenda (ein-/ausblendbar) ──
const tKnopf = $("#transkript-knopf");
let tOffen = false;
let tStand = null;
try { tOffen = localStorage.getItem("broki-live-transkript") === "1"; } catch {}

async function zeigeTranskript(erzwingen = false) {
  $("#transkript-karte").hidden = !tOffen;
  tKnopf.classList.toggle("aktiv", tOffen);
  tKnopf.setAttribute("aria-pressed", String(tOffen));
  const marke = `${tagId}/${letzterZyklus}`;
  if (!tOffen || (!erzwingen && tStand === marke)) return;
  tStand = marke;
  const abschnitte = (await (await fetch("/api/transcript")).json()).slice(-6);
  const ziel = $("#transkript");
  ziel.replaceChildren(...(abschnitte.length ? abschnitte.map((a, i) => el("p", i === abschnitte.length - 1 ? "neuester" : "", a.text)) : [el("p", "leer", "Noch kein Transkript.")]));
  ziel.scrollTop = ziel.scrollHeight;
}
tKnopf.addEventListener("click", () => {
  tOffen = !tOffen;
  try { localStorage.setItem("broki-live-transkript", tOffen ? "1" : "0"); } catch {}
  zeigeTranskript(true);
});

// ── Abgelegte Kategorien: eingeklappt über der aktuellen Liste ──
const offeneGruppen = new Set();
function zeigeGruppen(todos) {
  const namen = [...new Set(todos.map((t) => t.gruppe).filter(Boolean))];
  $("#gruppen").replaceChildren(
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

// ── To-dos: anklicken zum Bearbeiten, Kästchen zum Abhaken ──
let bearbeite = null; // ID des To-dos, das gerade bearbeitet wird; solange wird die Liste nicht neu aufgebaut

function todoZeile(t) {
  if (t.id === bearbeite) return todoEditor(t);
  const knopf = el("button", "todo-text");
  knopf.type = "button";
  knopf.title = "Anklicken zum Bearbeiten";
  const meta = el("span", "meta");
  meta.append("Wer: ", el("b", "", t.owner), "  ·  Bis: ", el("b", "", t.frist));
  knopf.append(el("span", "text", t.text), meta);
  knopf.addEventListener("click", () => {
    bearbeite = t.id;
    zeigeTodos();
    document.querySelector("#todos .editor input")?.focus();
  });
  const li = zeile(t.id, t.status, knopf);
  const box = li.querySelector(".box");
  box.setAttribute("role", "checkbox");
  box.setAttribute("aria-checked", String(t.status === "erledigt"));
  box.setAttribute("aria-label", "Erledigt");
  box.tabIndex = 0;
  const haken = () => sende(`/api/todos/${t.id}`, { status: t.status === "erledigt" ? "offen" : "erledigt" }, "PATCH").catch(console.warn);
  box.addEventListener("click", haken);
  box.addEventListener("keydown", (e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), haken()));
  return li;
}

function todoEditor(t) {
  const formular = el("form", "editor");
  const feld = (name, wert, platz, breit = false) => {
    const eingabe = el("input", breit ? "breit" : "");
    eingabe.type = "text";
    eingabe.name = name;
    eingabe.value = wert === "offen" && name !== "text" ? "" : wert;
    eingabe.placeholder = platz;
    eingabe.setAttribute("aria-label", platz);
    return eingabe;
  };
  const ende = () => { bearbeite = null; zeigeTodos(); };
  const speichern = el("button", "", "Speichern");
  const abbrechen = el("button", "zweit", "Abbrechen");
  abbrechen.type = "button";
  abbrechen.addEventListener("click", ende);
  const loeschen = el("button", "zweit", "Löschen");
  loeschen.type = "button";
  loeschen.addEventListener("click", async () => {
    if (!confirm("Dieses To-do wirklich löschen?")) return;
    await sende(`/api/todos/${t.id}`, {}, "DELETE").catch(console.warn);
    ende();
  });
  const knoepfe = el("div", "reihe");
  knoepfe.append(speichern, abbrechen, loeschen);
  formular.append(feld("text", t.text, "To-do", true), feld("owner", t.owner, "Wer? (leer = offen)"), feld("frist", t.frist, "Bis wann? (leer = offen)"), knoepfe);
  formular.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = new FormData(formular);
    await sende(`/api/todos/${t.id}`, { text: d.get("text"), owner: d.get("owner") || "offen", frist: d.get("frist") || "offen" }, "PATCH").catch(console.warn);
    ende();
  });
  formular.addEventListener("keydown", (e) => e.key === "Escape" && ende());
  const li = el("li", "bearbeiten");
  li.append(formular);
  return li;
}

function zeigeTodos() {
  const aktuell = stand.todos.filter((t) => !t.gruppe);
  if (bearbeite && !aktuell.some((t) => t.id === bearbeite)) bearbeite = null;
  fuelle("#todos", aktuell.map(todoZeile), stand.todos.length ? "Aktuelle Liste ist leer." : "Noch keine To-dos.");
  const offen = aktuell.filter((t) => t.status === "offen").length;
  $("#todo-zahl").textContent = aktuell.length ? `${offen} offen` : "";
}

// ── Alles anzeigen ──
function zeige({ protokoll, status, tag }) {
  zeigeStatus(status);
  if (tag.id !== tagId) {
    // Tag gewechselt: nichts davon ist "neu", also ohne Animation aufbauen
    tagId = tag.id;
    bekannt.clear();
    ersterAufbau = true;
    bearbeite = null;
  }
  stand = protokoll;
  an = status.aufnahme;
  quelle = status.quelle;
  letzterZyklus = status.letzterZyklus;
  ladeTage();
  tagwahl.disabled = an;
  $("#tag-info").textContent = an ? "" : "";
  tagwahl.title = an ? "Zum Wechseln erst den Assistenten ausschalten." : "";
  $("#arbeit").textContent = status.arbeit ?? (an && quelle === "mikro" ? "Aufnahme läuft. Der erste Abschnitt wird nach 20 Sekunden gesendet, danach jede Minute." : "");

  schalter.textContent = an ? "Assistent ist an" : "Assistent ist aus";
  schalter.classList.toggle("aktiv", an);
  schalter.setAttribute("aria-pressed", String(an));

  // Aufnahme folgt dem Serverstatus: läuft nur auf dem Aufnahmegerät und nur, wenn echte Schnipsel gefragt sind.
  const sollAufnehmen = an && quelle === "mikro" && istAufnahmegeraet();
  if (sollAufnehmen && !aufnahme.laeuft) aufnahme.start(status.zyklusSekunden).catch((f) => melde(f.message));
  if (!sollAufnehmen && aufnahme.laeuft) aufnahme.stopp();
  pegel.hidden = !aufnahme.laeuft && !sollAufnehmen;
  const fremd = "Der Assistent läuft auf einem anderen Gerät. Dieses Gerät zeigt nur an.";
  if (an && quelle === "mikro" && !istAufnahmegeraet()) $("#mikrofehler").textContent ||= fremd;
  if (!an && $("#mikrofehler").textContent === fremd) melde("");

  zeigeTranskript();
  zeigeGruppen(protokoll.todos);

  // Agenda: Anklicken wählt den Punkt aus. Transkript und neue Einträge laufen dann unter diesem Punkt.
  fuelle(
    "#agenda",
    protokoll.agenda.map((a) => {
      const knopf = el("button", "agenda-knopf");
      knopf.type = "button";
      knopf.setAttribute("aria-pressed", String(a.status === "läuft"));
      knopf.append(el("span", "box"), el("span", "text", a.titel));
      knopf.addEventListener("click", () => sende(`/api/agenda/${a.id}/aktiv`).catch(console.warn));
      return zeile(a.id, a.status, knopf, { box: false });
    }),
    "Keine Agenda hinterlegt. Im Admin beim Meeting eintragen.",
  );

  if (!bearbeite) zeigeTodos();

  // Vorschläge: unsichere To-dos, die ein Mensch übernimmt oder verwirft
  $("#vorschlag-karte").hidden = !protokoll.vorschlaege.length;
  fuelle(
    "#vorschlaege",
    protokoll.vorschlaege.map((v) => {
      const rahmen = el("div", "vorschlag");
      const knoepfe = el("div", "reihe");
      for (const [aktion, titel, klasse] of [["annehmen", "✓ Übernehmen", ""], ["verwerfen", "✕ Verwerfen", "zweit"]]) {
        const knopf = el("button", klasse, titel);
        knopf.addEventListener("click", () => sende(`/api/vorschlag/${v.id}/${aktion}`).catch(console.warn));
        knoepfe.append(knopf);
      }
      rahmen.append(el("div", "text", v.text), knoepfe);
      return zeile(v.id, "vorschlag", rahmen, { box: false, marke: "?" });
    }),
    "",
  );

  fuelle("#entscheidungen", protokoll.entscheidungen.map((e) => zeile(e.id, "fest", el("span", "text", e.text), { box: false, marke: "→" })), "Noch keine Entscheidungen.");
  fuelle(
    "#fragen",
    protokoll.offene_fragen.map((f) => zeile(f.id, f.status, el("span", "text", f.text), { box: false, marke: f.status === "beantwortet" ? "✓" : "?" })),
    "Keine offenen Fragen.",
  );

  ersterAufbau = false;
}

verbinde(zeige);
