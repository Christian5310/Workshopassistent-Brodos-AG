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

// ── Meeting auswählen: Erst danach füllt sich die Ansicht. Abgeschlossene Meetings liegen im Archiv. ──
const tagwahl = $("#tagwahl");
async function ladeTage() {
  const meetings = (await (await fetch("/api/tage")).json()).filter((t) => !t.abgeschlossen);
  const platzhalter = el("option", "", meetings.length ? "Meeting auswählen …" : "Noch kein Meeting – im Admin anlegen");
  platzhalter.value = "";
  tagwahl.replaceChildren(
    platzhalter,
    ...meetings.map((t) => {
      const o = el("option", "", `${t.name} · ${new Date(`${t.datum}T12:00:00`).toLocaleDateString("de-DE")}`);
      o.value = t.id;
      return o;
    }),
  );
  tagwahl.value = tagId ?? "";
}
tagwahl.addEventListener("change", async () => {
  if (!tagwahl.value) return void (tagwahl.value = tagId ?? "");
  try {
    abschlussInfo = null;
    await sende(`/api/tage/${tagwahl.value}/aktivieren`);
  } catch (fehler) {
    melde(fehler.message);
    tagwahl.value = tagId ?? "";
  }
});

// ── Aufnahme: Starten, Pausieren, Meeting schließen ──
const pegel = $("#pegel");

// Dieses Gerät ist das Aufnahmegerät, sobald hier gestartet wurde (übersteht ein Neuladen der Seite).
const MERKER = "broki-live-aufnahmegeraet";
const merke = (wert) => { try { wert ? localStorage.setItem(MERKER, "1") : localStorage.removeItem(MERKER); } catch {} };
const istAufnahmegeraet = () => { try { return localStorage.getItem(MERKER) === "1"; } catch { return false; } };

const aufnahme = new Aufnahme({
  beiPegel: (wert) => (pegel.firstElementChild.style.width = `${Math.round(wert * 100)}%`),
  beiFehler: melde,
});

const versuche = (aktion) => async () => {
  melde("");
  try {
    await aktion();
  } catch (fehler) {
    melde(fehler.message);
  }
};

$("#start").addEventListener("click", versuche(async () => {
  if (quelle === "mikro") await aufnahme.mikrofonOeffnen(); // erst fragen, dann starten
  merke(true);
  await sende("/api/regie/start");
}));

// Pausieren: Aufnahme anhalten, sonst bleibt alles, wie es ist. Nichts wird abgelegt oder geleert.
async function pausiere() {
  merke(false);
  await aufnahme.stopp(); // der angebrochene Abschnitt geht noch raus
  await sende("/api/regie/pause");
}
$("#pause").addEventListener("click", versuche(pausiere));

// Meeting schließen: alles liegt danach im Archiv, die Ansicht wird geleert.
let abschlussInfo = null;
$("#schliessen").addEventListener("click", versuche(async () => {
  const name = tagwahl.selectedOptions[0]?.textContent ?? "Meeting";
  $("#schluss-text").textContent = `„${name}" wird abgeschlossen${an ? ", die Aufnahme endet" : ""}. Transkript, To-dos, Entscheidungen und Fragen liegen danach im Archiv und lassen sich dort herunterladen. Die Ansicht hier wird geleert. Im Archiv kannst du das Meeting bei Bedarf wieder öffnen.`;
  const dialog = $("#schluss");
  dialog.returnValue = "abbrechen";
  dialog.showModal();
  await new Promise((fertig) => dialog.addEventListener("close", fertig, { once: true }));
  if (dialog.returnValue !== "schliessen") return;
  if (an) await pausiere();
  abschlussInfo = { name }; // vor dem Aufruf setzen: das Update vom Server kommt schneller als die Antwort
  try {
    await sende("/api/meeting/schliessen");
  } catch (fehler) {
    abschlussInfo = null;
    throw fehler;
  }
}));

// Rückgängig: nimmt die letzte Änderung zurück, egal ob sie vom Assistenten oder von Hand kam.
$("#rueckgaengig").addEventListener("click", versuche(() => sende("/api/rueckgaengig")));

// Liste ablegen: aktuelle To-dos unter dem laufenden Agendapunkt einsortieren, damit die Liste kurz bleibt.
$("#ablegen").addEventListener("click", versuche(() => sende("/api/todos/ablegen")));

// Solange aufgenommen wird, vor dem Verlassen der Seite warnen: Die Aufnahme läuft nur in diesem Tab.
window.addEventListener("beforeunload", (ereignis) => {
  if (aufnahme.laeuft) ereignis.preventDefault();
});

// Zeigt, dass wirklich aufgenommen wird: Sekunden bis der laufende Abschnitt gesendet wird.
setInterval(() => {
  const rest = Math.max(0, Math.ceil((aufnahme.naechsterVersand - Date.now()) / 1000));
  $("#countdown").textContent = aufnahme.laeuft ? `· Aufnahme läuft, sendet in ${rest} s` : "";
}, 500);

// ── Kleines Transkript-Fenster unter der Agenda (ein-/ausblendbar) ──
const tKnopf = $("#transkript-knopf");
let tOffen = false;
let tStand = null;
try { tOffen = localStorage.getItem("broki-live-transkript") === "1"; } catch {}

async function zeigeTranskript(erzwingen = false) {
  $("#transkript-karte").hidden = !tOffen || tagId === null;
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
  fuelle("#todos", aktuell.map(todoZeile), tagId === null ? "" : stand.todos.length ? "Aktuelle Liste ist leer." : "Noch keine To-dos.");
  const offen = aktuell.filter((t) => t.status === "offen").length;
  $("#todo-zahl").textContent = aktuell.length ? `${offen} offen` : "";
}

// ── Alles anzeigen ──
function zeige({ protokoll, status, tag }) {
  zeigeStatus(status);
  const neueId = tag?.id ?? null;
  if (neueId !== tagId) {
    // Meeting gewechselt oder geschlossen: nichts davon ist "neu", also ohne Animation aufbauen
    tagId = neueId;
    bekannt.clear();
    ersterAufbau = true;
    bearbeite = null;
    tStand = null;
  }
  stand = protokoll;
  an = status.aufnahme;
  quelle = status.quelle;
  letzterZyklus = status.letzterZyklus;
  ladeTage();
  tagwahl.disabled = an;
  tagwahl.title = an ? "Zum Wechseln erst pausieren." : "";

  // Steuerung: ohne Meeting nichts; mit Meeting Starten/Fortsetzen oder Pausieren, dazu Schließen
  const offen = tag !== null;
  $("#start").hidden = !offen || an;
  $("#start").textContent = status.letzterZyklus ? "▶ Aufnahme fortsetzen" : "▶ Aufnahme starten";
  $("#pause").hidden = !an;
  $("#schliessen").hidden = !offen;
  $("#transkript-knopf").hidden = !offen;
  $("#rueckgaengig").hidden = !offen || !status.rueckgaengig;
  $("#rueckgaengig").title = status.rueckgaengig ? `Zurücknehmen: ${status.rueckgaengig}` : "";
  aufnahme.sekunden = status.zyklusSekunden; // ein neuer Takt aus dem Admin gilt ab dem nächsten Abschnitt
  $("#ablegen").hidden = !protokoll.todos.some((t) => !t.gruppe);
  document.body.classList.toggle("ohne-meeting", !offen);

  const leer = $("#leerhinweis");
  leer.hidden = offen;
  if (!offen) {
    leer.replaceChildren(
      el("b", "", abschlussInfo ? `„${abschlussInfo.name}" ist abgeschlossen und liegt im Archiv.` : "Kein Meeting geöffnet."),
      el("span", "", abschlussInfo ? " Für ein weiteres Meeting oben eines auswählen." : " Wähle oben ein Meeting aus, dann füllt sich diese Ansicht."),
    );
    if (abschlussInfo) {
      const link = el("a", "", "Zum Archiv");
      link.href = "/archiv";
      leer.append(" ", link);
    }
  }
  $("#arbeit").textContent = !offen ? "" : status.arbeit ?? (an && quelle === "mikro" ? `Aufnahme läuft. Der erste Abschnitt wird nach 20 Sekunden gesendet, danach alle ${status.zyklusSekunden} Sekunden.` : !an && status.letzterZyklus ? "Pausiert. Alles bleibt erhalten, bis du das Meeting schließt." : "");

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
    offen ? "Keine Agenda hinterlegt. Im Admin beim Meeting eintragen." : "",
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

  fuelle("#entscheidungen", protokoll.entscheidungen.map((e) => zeile(e.id, "fest", el("span", "text", e.text), { box: false, marke: "→" })), offen ? "Noch keine Entscheidungen." : "");
  fuelle(
    "#fragen",
    protokoll.offene_fragen.map((f) => zeile(f.id, f.status, el("span", "text", f.text), { box: false, marke: f.status === "beantwortet" ? "✓" : "?" })),
    offen ? "Keine offenen Fragen." : "",
  );

  ersterAufbau = false;
}

verbinde(zeige);
