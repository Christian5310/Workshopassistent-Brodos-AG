import { el, gehe, icon, imRahmen, knopf, merlin, sende, verbinde } from "./common.js";

imRahmen("assistent");
const $ = (id) => document.querySelector(id);

// Merkt sich, was schon gezeigt wurde: so erkennen wir Neues und frisch Erledigtes für die Animation.
const bekannt = new Map();
let ersterAufbau = true;
let stand = null; // aktuelles Protokoll
let tagId = null;
let an = false;
let letzterZyklus = null;

const melde = (text) => ($("#meldung").textContent = text);
const versuche = (aktion) => async () => {
  melde("");
  try {
    await aktion();
  } catch (fehler) {
    melde(fehler.message);
  }
};
/** Setzt Icon und Text eines Knopfs. */
function beschrifte(k, iconName, text) {
  k.replaceChildren(icon(iconName), text);
}

function zeile(schluessel, status, inhalt, marke = null) {
  const li = el("li", status);
  const vorher = bekannt.get(schluessel);
  if (!ersterAufbau && vorher === undefined) li.classList.add("neu");
  if (!ersterAufbau && vorher !== undefined && vorher !== status && (status === "erledigt" || status === "beantwortet")) li.classList.add("frisch", "neu");
  bekannt.set(schluessel, status);
  if (marke) {
    const m = el("span", "marke");
    m.append(icon(marke));
    li.append(m);
  }
  li.append(inhalt);
  return li;
}

function fuelle(id, eintraege, leerText) {
  const liste = $(id);
  liste.replaceChildren(...(eintraege.length ? eintraege : leerText ? [el("li", "leer", leerText)] : []));
  liste.querySelector(".neu")?.scrollIntoView({ block: "nearest" });
}

// ── Meeting wählen und wechseln läuft über die Übersicht ──
let abschlussInfo = null;
const zurUebersicht = () => {
  try { sessionStorage.setItem("broki-uebersicht", "meeting"); } catch {}
  gehe("uebersicht");
};
$("#wechseln").addEventListener("click", zurUebersicht);
$("#verwalten").addEventListener("click", () => gehe("admin"));

// ── Aufnahme: Starten und Pausieren laufen über den Rahmen, der das Mikrofon hält ──
$("#start").addEventListener("click", versuche(() => merlin().starten()));
$("#pause").addEventListener("click", versuche(() => merlin().pausieren()));

// Meeting schließen: alles liegt danach im Archiv, die Ansicht wird geleert.
$("#schliessen").addEventListener("click", versuche(async () => {
  const name = letzterStand?.tag?.name ?? "Meeting";
  $("#schluss-text").textContent = `„${name}" wird abgeschlossen${an ? ", die Aufnahme endet" : ""}. Transkript, To-dos, Entscheidungen und Fragen liegen danach im Archiv und lassen sich dort herunterladen. Die Ansicht hier wird geleert. Im Archiv kannst du das Meeting bei Bedarf wieder öffnen.`;
  const dialog = $("#schluss");
  dialog.returnValue = "abbrechen";
  dialog.showModal();
  await new Promise((fertig) => dialog.addEventListener("close", fertig, { once: true }));
  if (dialog.returnValue !== "schliessen") return;
  if (an) await merlin().pausieren();
  abschlussInfo = { name }; // vor dem Aufruf setzen: das Update vom Server kommt schneller als die Antwort
  try {
    await sende("/api/meeting/schliessen");
  } catch (fehler) {
    abschlussInfo = null;
    throw fehler;
  }
}));

$("#rueckgaengig").addEventListener("click", versuche(() => sende("/api/rueckgaengig")));
$("#ablegen").addEventListener("click", versuche(() => sende("/api/todos/ablegen")));

// ── Transkript-Kasten (ein-/ausblendbar) ──
const tKnopf = $("#transkript-knopf");
let tOffen = false;
let tStand = null;
try { tOffen = localStorage.getItem("broki-live-transkript") === "1"; } catch {}

async function zeigeTranskript(erzwingen = false) {
  $("#transkript-karte").hidden = !tOffen || tagId === null;
  tKnopf.setAttribute("aria-pressed", String(tOffen));
  beschrifte(tKnopf, "text", tOffen ? "Transkript ausblenden" : "Transkript");
  const marke = `${tagId}/${letzterZyklus}`;
  if (!tOffen || (!erzwingen && tStand === marke)) return;
  tStand = marke;
  const abschnitte = (await (await fetch("/api/transcript")).json()).slice(-6);
  const ziel = $("#transkript");
  ziel.replaceChildren(...(abschnitte.length ? abschnitte.map((a, i) => el("p", i === abschnitte.length - 1 ? "neuester" : "", a.text)) : [el("p", "", "Noch kein Transkript.")]));
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
      const d = el("details", "eintrag");
      d.open = offeneGruppen.has(name);
      d.addEventListener("toggle", () => (d.open ? offeneGruppen.add(name) : offeneGruppen.delete(name)));
      const kopf = el("summary");
      const pfeil = el("span", "pfeil");
      pfeil.append(icon("runter"));
      kopf.append(icon("ablage"), el("span", "titel", name), el("span", "info", `${eintraege.length} To-do${eintraege.length === 1 ? "" : "s"} · ${offen} offen`), pfeil);
      const liste = el("ul", "liste");
      for (const t of eintraege) {
        const li = el("li", t.status);
        const box = el("span", "box");
        box.append(icon("check"));
        li.append(box, el("span", "text", `${t.text} · ${t.owner} · ${t.frist}`));
        liste.append(li);
      }
      const zurueck = knopf("Zurück in die aktuelle Liste", "undo", "zweit klein");
      zurueck.addEventListener("click", versuche(() => sende("/api/todos/ablegen", { name, zurueck: true })));
      const inhalt = el("div", "eintrag-inhalt");
      const reihe = el("div", "reihe");
      reihe.append(zurueck);
      inhalt.append(liste, reihe);
      d.append(kopf, inhalt);
      return d;
    }),
  );
}

// ── To-dos: anklicken zum Bearbeiten, Kästchen zum Abhaken ──
let bearbeite = null; // ID des To-dos, das gerade bearbeitet wird; solange wird die Liste nicht neu aufgebaut

function todoZeile(t) {
  if (t.id === bearbeite) return todoEditor(t);
  const text = el("button", "todo-text");
  text.type = "button";
  text.title = "Anklicken zum Bearbeiten";
  const meta = el("span", "meta");
  meta.append("Wer: ", el("b", "", t.owner), "  ·  Bis: ", el("b", "", t.frist));
  text.append(el("span", "text", t.text), meta);
  text.addEventListener("click", () => {
    bearbeite = t.id;
    zeigeTodos();
    document.querySelector("#todos .editor input")?.focus();
  });
  const box = el("span", "box");
  box.append(icon("check"));
  box.setAttribute("role", "checkbox");
  box.setAttribute("aria-checked", String(t.status === "erledigt"));
  box.setAttribute("aria-label", `Erledigt: ${t.text}`);
  box.tabIndex = 0;
  const haken = versuche(() => sende(`/api/todos/${t.id}`, { status: t.status === "erledigt" ? "offen" : "erledigt" }, "PATCH"));
  box.addEventListener("click", haken);
  box.addEventListener("keydown", (e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), haken()));
  const rahmen = document.createDocumentFragment();
  rahmen.append(box, text);
  return zeile(t.id, t.status, rahmen);
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
  const speichern = knopf("Speichern", "check");
  speichern.type = "submit";
  const abbrechen = knopf("Abbrechen", "x", "zweit");
  abbrechen.addEventListener("click", ende);
  const loeschen = knopf("Löschen", "trash", "zweit");
  loeschen.addEventListener("click", async () => {
    if (!confirm("Dieses To-do wirklich löschen?")) return;
    await sende(`/api/todos/${t.id}`, {}, "DELETE").catch((f) => melde(f.message));
    ende();
  });
  const knoepfe = el("div", "reihe");
  knoepfe.append(speichern, abbrechen, loeschen);
  formular.append(feld("text", t.text, "To-do", true), feld("owner", t.owner, "Wer? (leer = offen)"), feld("frist", t.frist, "Bis wann? (leer = offen)"), knoepfe);
  formular.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = new FormData(formular);
    await sende(`/api/todos/${t.id}`, { text: d.get("text"), owner: d.get("owner") || "offen", frist: d.get("frist") || "offen" }, "PATCH").catch((f) => melde(f.message));
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
}

// ── Alles anzeigen ──
let letzterStand = null;
function zeige(daten) {
  letzterStand = daten;
  const { protokoll, status, tag } = daten;
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
  letzterZyklus = status.letzterZyklus;
  $("#meeting-name").textContent = tag ? `${tag.name} · ${new Date(`${tag.datum}T12:00:00`).toLocaleDateString("de-DE")}` : "Noch kein Meeting geöffnet";
  $("#wechseln").hidden = tag === null;
  $("#wechseln").disabled = an;
  $("#wechseln").title = an ? "Zum Wechseln erst pausieren." : "";

  // Steuerung: ohne Meeting nichts; mit Meeting Starten/Fortsetzen oder Pausieren, dazu Schließen
  const offen = tag !== null;
  const leer = $("#leerzustand");
  leer.hidden = offen;
  if (!offen) {
    const kreis = el("span", "kreis");
    kreis.append(icon(abschlussInfo ? "archive" : "kalender"));
    const weiter = knopf("Meeting anlegen oder öffnen", "pfeil");
    weiter.addEventListener("click", zurUebersicht);
    leer.replaceChildren(kreis, el("p", "", abschlussInfo ? `„${abschlussInfo.name}" ist abgeschlossen und liegt im Archiv.` : "Kein Meeting geöffnet."), weiter);
    if (abschlussInfo) {
      const archiv = knopf("Zum Archiv", "archive", "zweit");
      archiv.addEventListener("click", () => gehe("archiv"));
      leer.append(archiv);
    }
  }
  $("#start").hidden = !offen || an;
  beschrifte($("#start"), "play", status.letzterZyklus ? "Aufnahme fortsetzen" : "Aufnahme starten");
  $("#pause").hidden = !an;
  beschrifte($("#pause"), "pause", "Pausieren");
  $("#schliessen").hidden = !offen;
  beschrifte($("#schliessen"), "archive", "Meeting schließen");
  tKnopf.hidden = !offen;
  $("#rueckgaengig").hidden = !offen || !status.rueckgaengig;
  beschrifte($("#rueckgaengig"), "undo", "Rückgängig");
  $("#rueckgaengig").title = status.rueckgaengig ? `Zurücknehmen: ${status.rueckgaengig}` : "";
  $("#ablegen").hidden = !protokoll.todos.some((t) => !t.gruppe);
  beschrifte($("#ablegen"), "ablage", "Liste ablegen");

  $("#protokoll").hidden = $("#spalten").hidden = !offen;
  $("#agenda-hilfe").hidden = $("#agenda-titel").hidden = $("#agenda").hidden = !offen;
  $("#arbeit").textContent = !offen
    ? "Hört im Meeting mit, schreibt das Transkript und führt die To-do-Liste."
    : status.arbeit ?? (an ? `Aufnahme läuft. Der erste Abschnitt wird nach 20 Sekunden gesendet, danach alle ${status.zyklusSekunden} Sekunden.` : status.letzterZyklus ? "Pausiert. Alles bleibt erhalten, bis du das Meeting schließt." : "Bereit. Wähle einen Agendapunkt und starte die Aufnahme.");

  // Kennzahlen
  const aktuell = protokoll.todos.filter((t) => !t.gruppe);
  $("#k-todos").textContent = protokoll.todos.filter((t) => t.status === "offen").length;
  $("#k-vorschlaege").textContent = protokoll.vorschlaege.length;
  $("#k-entscheidungen").textContent = protokoll.entscheidungen.length;
  $("#k-fragen").textContent = protokoll.offene_fragen.filter((f) => f.status === "offen").length;

  zeigeTranskript();
  zeigeGruppen(protokoll.todos);

  // Agenda als Auswahlfelder: Anklicken wählt den Punkt aus, er läuft dann.
  $("#agenda").replaceChildren(
    ...protokoll.agenda.map((a) => {
      const k = el("button", `select-item agenda-item${a.status === "läuft" ? " is-active" : a.status === "erledigt" ? " ist-erledigt" : ""}`);
      k.type = "button";
      k.setAttribute("aria-pressed", String(a.status === "läuft"));
      k.title = a.status === "läuft" ? "Läuft gerade" : a.status === "erledigt" ? "Erledigt – anklicken, um ihn wieder aufzunehmen" : "Anklicken, um diesen Punkt zu starten";
      k.append(icon(a.status === "läuft" ? "laeuft" : a.status === "erledigt" ? "erledigt" : "kreis"), el("span", "", a.titel));
      k.addEventListener("click", versuche(() => sende(`/api/agenda/${a.id}/aktiv`)));
      return k;
    }),
  );
  if (offen && !protokoll.agenda.length) $("#agenda").append(el("p", "hilfe", "Keine Agenda hinterlegt. Im Admin beim Meeting eintragen."));

  if (!bearbeite) zeigeTodos();

  // Vorschläge: unsichere To-dos, die ein Mensch übernimmt oder verwirft
  $("#vorschlag-karte").hidden = !protokoll.vorschlaege.length;
  fuelle(
    "#vorschlaege",
    protokoll.vorschlaege.map((v) => {
      const rahmen = el("div", "vorschlag");
      const knoepfe = el("div", "reihe");
      for (const [aktion, titel, iconName, klasse] of [["annehmen", "Übernehmen", "check", "klein"], ["verwerfen", "Verwerfen", "x", "zweit klein"]]) {
        const k = knopf(titel, iconName, klasse);
        k.addEventListener("click", versuche(() => sende(`/api/vorschlag/${v.id}/${aktion}`)));
        knoepfe.append(k);
      }
      rahmen.append(el("div", "text", v.text), knoepfe);
      return zeile(v.id, "vorschlag", rahmen, "frage");
    }),
    "",
  );

  fuelle("#entscheidungen", protokoll.entscheidungen.map((e) => zeile(e.id, "fest", el("span", "text", e.text), "pfeil")), "Noch keine Entscheidungen.");
  fuelle(
    "#fragen",
    protokoll.offene_fragen.map((f) => zeile(f.id, f.status, el("span", "text", f.text), f.status === "beantwortet" ? "check" : "frage")),
    "Keine offenen Fragen.",
  );

  ersterAufbau = false;
}

verbinde(zeige);
