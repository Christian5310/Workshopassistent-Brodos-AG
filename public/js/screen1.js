import { el, gehe, icon, imRahmen, knopf, merlin, sende, verbinde, zeigeAbhalten } from "./common.js";

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

// ── Meeting wählen und wechseln läuft über "Meeting" bzw. "Workshop" in der Navigation ──
let abschlussInfo = null;
const zurAuswahl = () => gehe(letzterStand?.workshop ? "workshop" : letzterStand?.tag ? "meeting" : "start");
$("#wechseln").addEventListener("click", zurAuswahl);

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

// ── To-dos gehören zu ihrem Agendapunkt. In der Liste stehen die des laufenden Punkts;
//    die der anderen Punkte liegen eingeklappt darüber. Wechselt man den Punkt, wechselt die Liste mit. ──
const laufenderPunkt = () => stand.agenda.find((a) => a.status === "läuft")?.id ?? null;
/** To-dos des laufenden Agendapunkts. Läuft keiner, zeigt die Liste alle. */
const aktuelleTodos = () => {
  const punkt = laufenderPunkt();
  return punkt ? stand.todos.filter((t) => t.agendapunkt === punkt) : stand.todos;
};

const offeneGruppen = new Set();
function zeigeGruppen() {
  const punkt = laufenderPunkt();
  const gruppen = [];
  if (punkt) {
    for (const a of stand.agenda) if (a.id !== punkt) gruppen.push({ name: a.titel, eintraege: stand.todos.filter((t) => t.agendapunkt === a.id) });
    gruppen.push({ name: "Ohne Agendapunkt", eintraege: stand.todos.filter((t) => !stand.agenda.some((a) => a.id === t.agendapunkt)) });
  }
  $("#gruppen").replaceChildren(
    ...gruppen.filter((g) => g.eintraege.length).map(({ name, eintraege }) => {
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
      const inhalt = el("div", "eintrag-inhalt");
      inhalt.append(liste, el("p", "hilfe", "Zum Bearbeiten links den Agendapunkt wieder auswählen."));
      d.append(kopf, inhalt);
      return d;
    }),
  );
}

// ── Eingeklappte Gruppen je Agendapunkt (Entscheidungen, Fragen) ──
const offeneKlapp = new Set();
function klappgruppe(schluessel, titel, eintraege, text, iconName = "ablage") {
  const d = el("details", "eintrag");
  d.open = offeneKlapp.has(schluessel);
  d.addEventListener("toggle", () => (d.open ? offeneKlapp.add(schluessel) : offeneKlapp.delete(schluessel)));
  const kopf = el("summary");
  const pfeil = el("span", "pfeil");
  pfeil.append(icon("runter"));
  kopf.append(icon(iconName), el("span", "titel", titel), el("span", "info", String(eintraege.length)), pfeil);
  const liste = el("ul", "liste");
  liste.append(...eintraege.map((e) => el("li", "", text(e))));
  const inhalt = el("div", "eintrag-inhalt");
  inhalt.append(liste);
  d.append(kopf, inhalt);
  return d;
}
function zeigeKlappgruppen(ziel, art, eintraege, agenda, text, beantwortet = []) {
  const gruppen = [...agenda.map((a) => ({ id: a.id, titel: a.titel })), { id: "", titel: "Ohne Agendapunkt" }]
    .map((g) => ({ ...g, eintraege: eintraege.filter((e) => (g.id ? e.agendapunkt === g.id : !agenda.some((a) => a.id === e.agendapunkt))) }))
    .filter((g) => g.eintraege.length)
    .map((g) => klappgruppe(`${art}-${g.id}`, g.titel, g.eintraege, text));
  if (beantwortet.length) gruppen.push(klappgruppe(`${art}-beantwortet`, "Beantwortet", beantwortet, text, "check"));
  ziel.replaceChildren(...gruppen);
}

// "Alles anzeigen": Entscheidungen und offene Fragen über alle Agendapunkte
$("#alles").addEventListener("click", () => {
  const p = stand;
  const inhalt = $("#uebersicht-inhalt");
  inhalt.replaceChildren();
  for (const a of [...p.agenda, { id: "", titel: "Ohne Agendapunkt" }]) {
    const passt = (e) => (a.id ? e.agendapunkt === a.id : !p.agenda.some((x) => x.id === e.agendapunkt));
    const ent = p.entscheidungen.filter(passt);
    const fr = p.offene_fragen.filter(passt);
    if (!ent.length && !fr.length) continue;
    const block = el("section", "stapel");
    block.append(el("h3", "", a.titel));
    const liste = el("ul", "liste");
    liste.append(...ent.map((e) => { const li = el("li"); li.append(icon("pfeil"), el("span", "", e.text)); return li; }));
    liste.append(...fr.map((f) => { const li = el("li", f.status); li.append(icon(f.status === "beantwortet" ? "check" : "frage"), el("span", "text", f.text)); return li; }));
    block.append(liste);
    inhalt.append(block);
  }
  if (!inhalt.children.length) inhalt.append(el("p", "gedaempft", "Noch keine Entscheidungen und keine Fragen."));
  $("#uebersicht").showModal();
});

// ── Merlin als Bubble: liest zur Einstimmung vor. Solange er spricht, ist das Mikrofon stumm. ──
const STATIONEN = [["begruessung", "Begrüßung"], ["eingereicht", "Eingereicht"], ["regeln", "Regeln"], ["agenda", "Agenda"]];
let ansagen = null;
let station = 0;
let bearbeitet = false;
let vorlesen = { stimme: "", tempo: 0.98 }; // aus Admin → Erweitert → Merlin-Bubble
const stimme = () => speechSynthesis.getVoices().find((v) => vorlesen.stimme && v.name === vorlesen.stimme) ?? speechSynthesis.getVoices().find((v) => v.lang?.startsWith("de")) ?? null;

async function ladeAnsagen(neu = false) {
  $("#merlin-info").textContent = neu || !ansagen ? "Merlin bereitet die Texte vor …" : "";
  ansagen = await (await fetch(`/api/tage/${tagId}/ansagen${neu ? "?neu" : ""}`)).json();
  $("#merlin-info").textContent = "";
  zeigeMerlin();
}
function zeigeMerlin() {
  $("#merlin-stationen").replaceChildren(
    ...STATIONEN.map(([id, name], i) => {
      const k = el("button", `merlin-station${i === station ? " ist-aktiv" : ""}`, name);
      k.type = "button";
      k.setAttribute("role", "tab");
      k.setAttribute("aria-selected", String(i === station));
      k.addEventListener("click", () => { verstumme(); station = i; zeigeMerlin(); });
      return k;
    }),
  );
  const text = ansagen?.[STATIONEN[station][0]] ?? "";
  $("#merlin-blase").textContent = text;
  $("#merlin-text").value = text;
  $("#merlin-blase").hidden = bearbeitet;
  $("#merlin-text").hidden = !bearbeitet;
  $("#merlin-bearbeiten").textContent = bearbeitet ? "Text speichern" : "Text bearbeiten";
  $("#merlin-weiter").hidden = station === STATIONEN.length - 1;
}
function stummschalten(an) {
  try { merlin().aufnahme.stumm = an; } catch {}
}
function verstumme() {
  if ("speechSynthesis" in window) speechSynthesis.cancel();
  stummschalten(false);
  document.querySelector("#merlin-knopf").classList.remove("spricht");
  beschrifte($("#merlin-sprechen"), "play", "Vorlesen");
}
function sprich() {
  if (!("speechSynthesis" in window)) return void ($("#merlin-info").textContent = "Dieser Browser kann nicht vorlesen. Der Text steht in der Sprechblase.");
  if (speechSynthesis.speaking) return verstumme();
  const satz = new SpeechSynthesisUtterance($("#merlin-blase").textContent);
  satz.lang = "de-DE";
  satz.voice = stimme();
  satz.rate = vorlesen.tempo;
  satz.onend = satz.onerror = () => verstumme();
  stummschalten(true); // Merlin soll sich nicht selbst mitschreiben
  document.querySelector("#merlin-knopf").classList.add("spricht");
  beschrifte($("#merlin-sprechen"), "pause", "Stopp");
  speechSynthesis.speak(satz);
}
function schliesseMerlin() {
  verstumme();
  $("#merlin").hidden = true;
  $("#merlin-knopf").setAttribute("aria-expanded", "false");
}
$("#merlin-knopf").addEventListener("click", versuche(async () => {
  if (!$("#merlin").hidden) return schliesseMerlin();
  $("#merlin").hidden = false;
  $("#merlin-knopf").setAttribute("aria-expanded", "true");
  if (!ansagen || ansagen.__tag !== tagId) { await ladeAnsagen(); ansagen.__tag = tagId; }
}));
$("#merlin-zu").addEventListener("click", schliesseMerlin);
$("#merlin-sprechen").addEventListener("click", sprich);
$("#merlin-weiter").addEventListener("click", () => { verstumme(); station = Math.min(station + 1, STATIONEN.length - 1); zeigeMerlin(); sprich(); });
$("#merlin-bearbeiten").addEventListener("click", versuche(async () => {
  if (bearbeitet) {
    ansagen[STATIONEN[station][0]] = $("#merlin-text").value;
    const { __tag, ...texte } = ansagen;
    await sende(`/api/tage/${tagId}/ansagen`, texte, "PUT");
  }
  bearbeitet = !bearbeitet;
  zeigeMerlin();
}));
$("#merlin-neu").addEventListener("click", versuche(async () => {
  if (!confirm("Alle vier Texte neu entwerfen? Eigene Änderungen gehen dabei verloren.")) return;
  verstumme();
  await ladeAnsagen(true);
  ansagen.__tag = tagId;
}));
beschrifte($("#merlin-sprechen"), "play", "Vorlesen");
beschrifte($("#merlin-weiter"), "pfeil", "Weiter");
if ("speechSynthesis" in window) speechSynthesis.onvoiceschanged = () => {};

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
  const aktuell = aktuelleTodos();
  if (bearbeite && !aktuell.some((t) => t.id === bearbeite)) bearbeite = null;
  const punkt = stand.agenda.find((a) => a.status === "läuft");
  $("#todo-titel").textContent = punkt ? `To-dos: ${punkt.titel}` : "To-dos";
  fuelle("#todos", aktuell.map(todoZeile), stand.todos.length ? "Zu diesem Agendapunkt gibt es noch keine To-dos." : "Noch keine To-dos.");
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
  $("#kontext-titel").textContent = daten.workshop ? "Workshop" : "Meeting";
  $("#wechseln").textContent = daten.workshop ? "Workshop wechseln" : "Meeting wechseln";
  $("#wechseln").hidden = tag === null;
  $("#abhalten").hidden = tag === null;
  if (tag) zeigeAbhalten($("#abhalten"), "assistent", daten);
  $("#wechseln").disabled = an;
  $("#wechseln").title = an ? "Zum Wechseln erst pausieren." : "";

  // Steuerung: ohne Meeting nichts; mit Meeting Starten/Fortsetzen oder Pausieren, dazu Schließen
  const offen = tag !== null;
  const leer = $("#leerzustand");
  leer.hidden = offen;
  if (!offen) {
    const kreis = el("span", "kreis");
    kreis.append(icon(abschlussInfo ? "archive" : "kalender"));
    const weiter = knopf("Meeting oder Workshop wählen", "pfeil");
    weiter.addEventListener("click", () => gehe("start"));
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

  $("#protokoll").hidden = $("#spalten").hidden = !offen;
  $("#agenda-hilfe").hidden = $("#agenda-titel").hidden = $("#agenda").hidden = !offen;
  $("#arbeit").textContent = !offen
    ? "Hört im Meeting mit, schreibt das Transkript und führt die To-do-Liste."
    : status.arbeit ?? (an ? `Aufnahme läuft. Der erste Abschnitt wird nach 20 Sekunden gesendet, danach alle ${status.zyklusSekunden} Sekunden.` : status.letzterZyklus ? "Pausiert. Alles bleibt erhalten, bis du das Meeting schließt." : "Bereit. Wähle einen Agendapunkt und starte die Aufnahme.");

  // Kennzahlen
  $("#k-todos").textContent = protokoll.todos.filter((t) => t.status === "offen").length;
  $("#k-vorschlaege").textContent = protokoll.vorschlaege.length;
  $("#k-entscheidungen").textContent = protokoll.entscheidungen.length;
  $("#k-fragen").textContent = protokoll.offene_fragen.filter((f) => f.status === "offen").length;

  zeigeTranskript();
  zeigeGruppen();

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

  // Entscheidungen und offene Fragen: im Kasten die des laufenden Punkts, die übrigen eingeklappt darüber.
  // Beantwortete Fragen liegen eingeklappt in "Beantwortet".
  const punkt = protokoll.agenda.find((a) => a.status === "läuft")?.id ?? null;
  const zumPunkt = (e) => !punkt || e.agendapunkt === punkt;
  const offeneFragen = protokoll.offene_fragen.filter((f) => f.status !== "beantwortet");
  fuelle("#entscheidungen", protokoll.entscheidungen.filter(zumPunkt).map((e) => zeile(e.id, "fest", el("span", "text", e.text), "pfeil")), protokoll.entscheidungen.length ? "Zu diesem Agendapunkt noch keine." : "Noch keine Entscheidungen.");
  fuelle("#fragen", offeneFragen.filter(zumPunkt).map((f) => zeile(f.id, f.status, el("span", "text", f.text), "frage")), offeneFragen.length ? "Zu diesem Agendapunkt keine." : "Keine offenen Fragen.");
  zeigeKlappgruppen($("#e-gruppen"), "e", protokoll.entscheidungen.filter((e) => !zumPunkt(e)), protokoll.agenda, (e) => e.text);
  zeigeKlappgruppen($("#f-gruppen"), "f", offeneFragen.filter((f) => !zumPunkt(f)), protokoll.agenda, (f) => f.text, protokoll.offene_fragen.filter((f) => f.status === "beantwortet"));
  if (daten.vorlesen) vorlesen = daten.vorlesen;
  $("#merlin-knopf").hidden = !offen;
  if (!offen) schliesseMerlin();

  ersterAufbau = false;
}

verbinde(zeige);
