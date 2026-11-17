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

// ── To-dos: Die Liste zeigt die aktuellen To-dos des laufenden Punkts. Häkchen legt ein To-do ab.
//    Abgelegtes liegt beim Agendapunkt links (Ordner) bzw. unter „Ohne Agendapunkt" und bleibt dort bearbeitbar. ──
const laufenderPunkt = () => stand.agenda.find((a) => a.status === "läuft")?.id ?? null;
const ohnePunkt = (t) => !stand.agenda.some((a) => a.id === t.agendapunkt);
const zumPunkt = (id) => (t) => (id === "" ? ohnePunkt(t) : t.agendapunkt === id);
/** Aktuelle (nicht abgelegte) To-dos des laufenden Punkts; läuft keiner, die ohne Agendapunkt. */
const aktuelleTodos = () => stand.todos.filter((t) => !t.gruppe && zumPunkt(laufenderPunkt() ?? "")(t));

// Drag & Drop: To-do auf einen Agendapunkt (oder „Ohne Agendapunkt") ziehen
let gezogen = null;
function alsZiel(knoten, punktId) {
  knoten.addEventListener("dragover", (e) => { if (gezogen) { e.preventDefault(); knoten.classList.add("ziel-aktiv"); } });
  knoten.addEventListener("dragleave", () => knoten.classList.remove("ziel-aktiv"));
  knoten.addEventListener("drop", (e) => {
    e.preventDefault();
    knoten.classList.remove("ziel-aktiv");
    const id = gezogen;
    gezogen = null;
    if (!id) return;
    // Auf den laufenden Punkt: zurück in die Liste. Sonst: dort ablegen.
    versuche(() => sende(`/api/todos/${id}`, { agendapunkt: punktId, gruppe: punktId && punktId === laufenderPunkt() ? "" : "abgelegt" }, "PATCH"))();
  });
}

// Ablage-Fenster: alle To-dos eines Agendapunkts, bearbeitbar; erledigte eingeklappt
let ablageOrt = null; // Agendapunkt-ID, "" = ohne Agendapunkt, null = Fenster zu
function oeffneAblage(id) {
  ablageOrt = id;
  bearbeite = null;
  zeigeAblage();
  if (!$("#ablage").open) $("#ablage").showModal();
}
$("#ablage").addEventListener("close", () => { ablageOrt = null; bearbeite = null; zeigeTodos(); });
function zeigeAblage() {
  if (ablageOrt === null || !stand) return;
  const punkt = stand.agenda.find((a) => a.id === ablageOrt);
  $("#ablage-titel").textContent = punkt ? `Ablage: ${punkt.titel}` : "Ohne Agendapunkt";
  const alle = stand.todos.filter(zumPunkt(ablageOrt));
  const offen = alle.filter((t) => t.status !== "erledigt");
  const fertig = alle.filter((t) => t.status === "erledigt");
  fuelle("#ablage-liste", offen.map((t) => todoZeile(t, "ablage")), alle.length ? "Alle To-dos hier sind erledigt." : "Hier liegen noch keine To-dos.");
  $("#ablage-erledigt").hidden = !fertig.length;
  $("#ablage-erledigt-titel").textContent = `Erledigt (${fertig.length})`;
  fuelle("#ablage-erledigt-liste", fertig.map((t) => todoZeile(t, "ablage")), "");
}

// "Alle anzeigen": großes Fenster mit allen Entscheidungen bzw. Fragen, nach Agendapunkt; bearbeiten, löschen, Fragen beantworten
const kurzliste = () => (innerHeight >= 1100 ? 5 : innerHeight >= 900 ? 4 : 3); // so viele zeigt der Kasten (neueste zuerst), je nach Fensterhöhe
let alleArt = null; // "entscheidungen" | "fragen", solange das Fenster offen ist
let inBearbeitung = null; // ID des Eintrags, der gerade bearbeitet wird

function zeigeAlle() {
  const p = stand;
  if (!alleArt || !p) return;
  const fragen = alleArt === "fragen";
  const eintraege = fragen ? p.offene_fragen : p.entscheidungen;
  $("#uebersicht-titel").textContent = `${fragen ? "Fragen" : "Entscheidungen"} (${eintraege.length})`;
  const inhalt = $("#uebersicht-inhalt");
  inhalt.replaceChildren();
  for (const a of [...p.agenda, { id: "", titel: "Ohne Agendapunkt" }]) {
    const passt = (e) => (a.id ? e.agendapunkt === a.id : !p.agenda.some((x) => x.id === e.agendapunkt));
    const liste = eintraege.filter(passt);
    if (!liste.length) continue;
    const block = el("section", "stapel");
    block.append(el("h3", "", a.titel));
    const ul = el("ul", "liste");
    ul.append(...liste.map((e) => alleZeile(e, fragen)));
    block.append(ul);
    inhalt.append(block);
  }
  if (!inhalt.children.length) inhalt.append(el("p", "gedaempft", fragen ? "Noch keine Fragen." : "Noch keine Entscheidungen."));
}
function alleZeile(e, fragen) {
  const li = el("li", `alle-zeile ${e.status ?? ""}`);
  const pfad = `/api/eintraege/${fragen ? "fragen" : "entscheidungen"}/${e.id}`;
  li.append(icon(fragen ? (e.status === "beantwortet" ? "check" : "frage") : "pfeil"));
  if (inBearbeitung === e.id) {
    const feld = el("input");
    feld.type = "text";
    feld.value = e.text;
    feld.maxLength = 300;
    feld.setAttribute("aria-label", "Text bearbeiten");
    const speichern = knopf("Speichern", "check", "klein");
    const abbrechen = knopf("Abbrechen", "x", "zweit klein");
    const sichern = versuche(async () => { await sende(pfad, { text: feld.value }, "PATCH"); inBearbeitung = null; zeigeAlle(); });
    speichern.addEventListener("click", sichern);
    feld.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); sichern(); } if (ev.key === "Escape") { ev.preventDefault(); inBearbeitung = null; zeigeAlle(); } });
    abbrechen.addEventListener("click", () => { inBearbeitung = null; zeigeAlle(); });
    li.append(feld, speichern, abbrechen);
    queueMicrotask(() => feld.focus());
    return li;
  }
  li.append(el("span", "text", e.text));
  const aktionen = el("span", "zeilen-aktionen");
  if (fragen) {
    const k = knopf(e.status === "beantwortet" ? "Wieder offen" : "Beantwortet", e.status === "beantwortet" ? "undo" : "check", "zweit klein");
    k.addEventListener("click", versuche(() => sende(pfad, { status: e.status === "beantwortet" ? "offen" : "beantwortet" }, "PATCH")));
    aktionen.append(k);
  }
  const bearbeiten = knopf("Bearbeiten", "text", "zweit klein");
  bearbeiten.addEventListener("click", () => { inBearbeitung = e.id; zeigeAlle(); });
  const loeschen = knopf("Löschen", "trash", "zweit klein");
  loeschen.addEventListener("click", versuche(async () => {
    if (!confirm(`„${e.text}" löschen?`)) return;
    await sende(pfad, {}, "DELETE");
  }));
  aktionen.append(bearbeiten, loeschen);
  li.append(aktionen);
  return li;
}
for (const [knopfId, art] of [["#alle-e", "entscheidungen"], ["#alle-f", "fragen"]]) {
  $(knopfId).addEventListener("click", () => { alleArt = art; inBearbeitung = null; zeigeAlle(); $("#uebersicht").showModal(); });
}
$("#uebersicht").addEventListener("close", () => { alleArt = null; inBearbeitung = null; });

// Merlin (Navigation, Einstimmung, Pausen-Erinnerung) lebt im App-Rahmen: public/js/merlin.js


// ── To-dos: anklicken zum Bearbeiten, Kästchen zum Abhaken ──
let bearbeite = null; // ID des To-dos, das gerade bearbeitet wird; solange wird die Liste nicht neu aufgebaut

function todoZeile(t, ort = "liste") {
  if (t.id === bearbeite) return todoEditor(t);
  const text = el("button", "todo-text");
  text.type = "button";
  text.title = "Anklicken zum Bearbeiten";
  const meta = el("span", "meta");
  meta.append("Wer: ", el("b", "", t.owner), "  ·  Bis: ", el("b", "", t.frist));
  if (ort === "ablage" && !t.gruppe) meta.append("  ·  in der aktuellen Liste");
  text.append(el("span", "text", t.text), meta);
  text.addEventListener("click", () => {
    bearbeite = t.id;
    neuZeichnen();
    document.querySelector(".editor input")?.focus();
  });
  const box = el("span", "box");
  box.append(icon("check"));
  box.setAttribute("role", "checkbox");
  box.tabIndex = 0;
  // In der Liste legt das Häkchen ab; in der Ablage hakt es ab.
  const inListe = ort === "liste";
  box.setAttribute("aria-checked", String(!inListe && t.status === "erledigt"));
  box.setAttribute("aria-label", inListe ? `Ablegen: ${t.text}` : `Erledigt: ${t.text}`);
  box.title = inListe ? "Ablegen (beim Agendapunkt links)" : "Erledigt";
  const haken = versuche(() => sende(`/api/todos/${t.id}`, inListe ? { gruppe: "abgelegt" } : { status: t.status === "erledigt" ? "offen" : "erledigt" }, "PATCH"));
  box.addEventListener("click", haken);
  box.addEventListener("keydown", (e) => (e.key === " " || e.key === "Enter") && (e.preventDefault(), haken()));
  const rahmen = document.createDocumentFragment();
  rahmen.append(box, text);
  const li = zeile(`${ort}:${t.id}`, inListe ? "offen" : t.status, rahmen);
  li.draggable = true;
  li.addEventListener("dragstart", (e) => { gezogen = t.id; e.dataTransfer.setData("text/plain", t.id); e.dataTransfer.effectAllowed = "move"; li.classList.add("zieht"); });
  li.addEventListener("dragend", () => { gezogen = null; li.classList.remove("zieht"); });
  return li;
}
const neuZeichnen = () => { zeigeTodos(); zeigeAblage(); };

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
  const ende = () => { bearbeite = null; neuZeichnen(); };
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
  if (t.gruppe) {
    const zurueck = knopf("Zurück in die Liste", "undo", "zweit");
    zurueck.addEventListener("click", async () => {
      await sende(`/api/todos/${t.id}`, { gruppe: "", agendapunkt: laufenderPunkt() ?? "" }, "PATCH").catch((f) => melde(f.message));
      ende();
    });
    knoepfe.append(zurueck);
  }
  const punktWahl = el("select", "breit");
  punktWahl.name = "agendapunkt";
  punktWahl.setAttribute("aria-label", "Agendapunkt");
  for (const [id, titel] of [["", "Ohne Agendapunkt"], ...stand.agenda.map((a) => [a.id, `Agendapunkt: ${a.titel}`])]) { const o = el("option", "", titel); o.value = id; punktWahl.append(o); }
  punktWahl.value = stand.agenda.some((a) => a.id === t.agendapunkt) ? t.agendapunkt : "";
  formular.append(feld("text", t.text, "To-do", true), feld("owner", t.owner, "Wer? (leer = offen)"), feld("frist", t.frist, "Bis wann? (leer = offen)"), punktWahl, knoepfe);
  formular.addEventListener("submit", async (e) => {
    e.preventDefault();
    const d = new FormData(formular);
    await sende(`/api/todos/${t.id}`, { text: d.get("text"), owner: d.get("owner") || "offen", frist: d.get("frist") || "offen", ...(d.get("agendapunkt") !== (t.agendapunkt ?? "") ? { agendapunkt: d.get("agendapunkt"), gruppe: d.get("agendapunkt") && d.get("agendapunkt") === laufenderPunkt() ? "" : "abgelegt" } : {}) }, "PATCH").catch((f) => melde(f.message));
    ende();
  });
  formular.addEventListener("keydown", (e) => e.key === "Escape" && ende());
  const li = el("li", "bearbeiten");
  li.append(formular);
  return li;
}

function zeigeTodos() {
  const aktuell = aktuelleTodos();
  if (bearbeite && !stand.todos.some((t) => t.id === bearbeite)) bearbeite = null;
  const punkt = stand.agenda.find((a) => a.status === "läuft");
  $("#todo-titel").textContent = punkt ? `To-dos: ${punkt.titel}` : "To-dos";
  fuelle("#todos", aktuell.map((t) => todoZeile(t, "liste")), stand.todos.length ? "Keine aktuellen To-dos. Abgelegtes findest du links beim Agendapunkt (Ordner)." : "Noch keine To-dos.");
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

  $("#arbeit").classList.toggle("eingang", offen && (status.arbeit ?? "").startsWith("Transkript ist da"));
  $("#arbeit").title = $("#arbeit").textContent; // falls der Text gekürzt angezeigt wird

  // Kennzahlen
  $("#k-todos").textContent = protokoll.todos.filter((t) => t.status === "offen").length;
  $("#k-vorschlaege").textContent = protokoll.vorschlaege.length;
  $("#k-entscheidungen").textContent = protokoll.entscheidungen.length;
  $("#k-fragen").textContent = protokoll.offene_fragen.filter((f) => f.status === "offen").length;

  zeigeTranskript();

  // Agenda als Auswahlfelder: Anklicken wählt den Punkt aus, er läuft dann.
  $("#agenda").replaceChildren(
    ...protokoll.agenda.map((a) => {
      const k = el("button", `select-item agenda-item${a.status === "läuft" ? " is-active" : a.status === "erledigt" ? " ist-erledigt" : ""}`);
      k.type = "button";
      k.setAttribute("aria-pressed", String(a.status === "läuft"));
      k.title = a.status === "läuft" ? "Läuft gerade" : a.status === "erledigt" ? "Erledigt – anklicken, um ihn wieder aufzunehmen" : "Anklicken, um diesen Punkt zu starten";
      k.append(icon(a.status === "läuft" ? "laeuft" : a.status === "erledigt" ? "erledigt" : "kreis"), el("span", "", a.titel));
      k.addEventListener("click", versuche(() => sende(`/api/agenda/${a.id}/aktiv`)));
      alsZiel(k, a.id);
      const reihe = el("div", "agenda-zeile");
      reihe.append(k);
      const zahl = protokoll.todos.filter((t) => t.agendapunkt === a.id && t.status !== "erledigt").length;
      const alle = protokoll.todos.filter((t) => t.agendapunkt === a.id).length;
      if (alle) {
        const o = el("button", "ordner");
        o.type = "button";
        o.title = `Ablage öffnen: ${zahl} offen, ${alle} insgesamt`;
        o.setAttribute("aria-label", `Ablage ${a.titel}: ${zahl} offene To-dos`);
        o.append(icon("ablage"), String(zahl));
        o.addEventListener("click", () => oeffneAblage(a.id));
        alsZiel(o, a.id);
        reihe.append(o);
      }
      return reihe;
    }),
  );
  const ohne = protokoll.todos.filter((t) => !protokoll.agenda.some((a) => a.id === t.agendapunkt));
  $("#ohne-punkt").hidden = !offen;
  $("#ohne-punkt").replaceChildren(icon("ablage"), `Ohne Agendapunkt (${ohne.filter((t) => t.status !== "erledigt").length})`);
  if (offen && !protokoll.agenda.length) $("#agenda").append(el("p", "hilfe", "Keine Agenda hinterlegt. Im Admin beim Meeting eintragen."));

  if (!bearbeite) { zeigeTodos(); zeigeAblage(); }

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

  // Entscheidungen und offene Fragen: im Kasten nur die neuesten (3 bis 5, je nach Platz), alles im großen Fenster.
  const offeneFragen = protokoll.offene_fragen.filter((f) => f.status !== "beantwortet");
  const neueste = (liste) => liste.slice(-kurzliste()).reverse();
  fuelle("#entscheidungen", neueste(protokoll.entscheidungen).map((e) => zeile(e.id, "fest", el("span", "text", e.text), "pfeil")), "Noch keine Entscheidungen.");
  fuelle("#fragen", neueste(offeneFragen).map((f) => zeile(f.id, f.status, el("span", "text", f.text), "frage")), "Keine offenen Fragen.");
  $("#alle-e").hidden = !protokoll.entscheidungen.length;
  $("#alle-e").textContent = `Alle anzeigen (${protokoll.entscheidungen.length})`;
  $("#alle-f").hidden = !protokoll.offene_fragen.length;
  $("#alle-f").textContent = `Alle anzeigen (${protokoll.offene_fragen.length})`;
  if (!inBearbeitung) zeigeAlle(); // offenes Fenster aktuell halten, Eingaben nicht überschreiben

  ersterAufbau = false;
}

verbinde(zeige);
$("#ohne-punkt").addEventListener("click", () => oeffneAblage(""));
alsZiel($("#ohne-punkt"), "");
