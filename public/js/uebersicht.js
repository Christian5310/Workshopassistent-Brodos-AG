// Start und Meeting-Auswahl. Nach dem Eintreten entscheidet man: Meeting oder Workshop abhalten.
// Unter "Meeting" richtet man ein neues Meeting ein oder öffnet ein bestehendes.
import { el, gehe, icon, imRahmen, sende, verbinde } from "./common.js";

const modus = new URLSearchParams(location.search).get("b") === "meeting" ? "meeting" : "start";
imRahmen(modus);
const $ = (id) => document.querySelector(id);
const melde = (text) => ($("#meldung").textContent = text);
const beschrifte = (id, iconName, text) => $(id).replaceChildren(icon(iconName), text);
const option = (wert, text) => { const o = el("option", "", text); o.value = wert; return o; };
const datum = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("de-DE");

const WEGE = {
  meeting: { name: "Meeting Assistent", icon: "mic", text: "Für die tägliche Arbeit: Meeting einrichten, mitschreiben lassen, To-dos führen. Agenten kannst du dazunehmen." },
  workshop: { name: "Workshop Assistent", icon: "users", text: "Für den größeren Rahmen: zusätzlich Teilnehmer, eingereichtes Material und daraus verdichtetes Wissen für Assistent und Agenten." },
};

// Auswahl links: dieselben zwei Wege, der aktuelle ist markiert
$("#wahl").replaceChildren(
  ...Object.entries(WEGE).map(([id, w]) => {
    const k = el("button", `select-item${id === modus ? " is-active" : ""}`);
    k.type = "button";
    k.append(icon(w.icon), el("span", "", w.name));
    k.addEventListener("click", () => gehe(id));
    return k;
  }),
);

$("#merlin-mitte").hidden = modus !== "start";
// Start: nur Merlin in der Mitte. Klick auf Merlin oder die Sprechblase zeigt die zwei Wege, darunter das Mikrofon.
document.body.classList.toggle("start-modus", modus === "start");
$("#b-meeting").hidden = modus !== "meeting";
if (modus === "start") starteMerlinMitte();

function starteMerlinMitte() {
  const mitte = $("#merlin-mitte");
  const figur = $("#merlin-figur");
  const frage = $("#merlin-frage");
  const mikro = $("#merlin-mitte-mikro");
  const startText = frage.innerHTML;
  for (const k of document.querySelectorAll(".merlin-pille")) {
    const id = k.dataset.ziel;
    k.append(icon(WEGE[id].icon), el("span", "", id === "meeting" ? "Meeting" : "Workshop"));
    k.title = WEGE[id].text;
    k.addEventListener("click", () => gehe(id));
  }
  const aufgeklappt = (an) => {
    mitte.classList.toggle("offen", an);
    figur.setAttribute("aria-expanded", String(an));
  };
  const umschalten = () => aufgeklappt(!mitte.classList.contains("offen"));
  figur.addEventListener("click", umschalten);
  frage.addEventListener("click", umschalten);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    window.parent?.merlin?.navigator?.beendeFuehrung?.(); // läuft gerade die Führung, beendet Esc sie
    aufgeklappt(false);
  });

  // Sprachsteuerung über Merlin im Rahmen (public/js/merlin.js), ohne dessen Fenster zu öffnen; seine Antworten erscheinen hier in der Sprechblase
  const navi = window.parent?.merlin?.navigator;
  if (!navi?.hoereLeise) return void ($(".merlin-mikro-bereich").hidden = true);
  const bild = $("#merlin-bild");
  const BILD = { ruhig: "/img/merlin-avatar.png", hoert: "/img/merlin-hoert.webp" };
  new Image().src = BILD.hoert; // vorladen, damit der Wechsel beim Klick sofort sichtbar ist
  mikro.addEventListener("click", () => navi.hoereLeise());
  $("#fuehrung-start").addEventListener("click", () => navi.starteFuehrung());

  // Führung durch die App: die Bühne liegt im App-Rahmen (public/js/fuehrung-buehne.js). Danach stehen Meeting und Workshop zur Wahl.
  const nachDerFuehrung = (s) => { if (s?.aus && s.fertig) aufgeklappt(true); };

  // Freihand-Modus: Merlin hört ohne Klick zu (Admin → Erweitert). Der Hinweis zeigt, wie man ihn anspricht, oder was nicht klappt.
  let lauscht = false;
  const GRUND_TEXT = () => (lauscht ? "Merlin hört zu. Sag „Merlin, …“" : "Mit Merlin sprechen");
  const abmelden = navi.beobachte({
    sage: (text) => { frage.textContent = text; },
    fuehrung: nachDerFuehrung,
    lauscht: ({ an, hinweis }) => {
      lauscht = an;
      mikro.classList.toggle("lauscht", an);
      $("#merlin-mikro-text").textContent = hinweis || GRUND_TEXT();
    },
    zustand: (name) => {
      figur.classList.toggle("spricht", name === "spricht");
      mikro.classList.toggle("hoert", name === "hoert");
      mikro.setAttribute("aria-pressed", String(name === "hoert"));
      figur.classList.toggle("hoert", name === "hoert");
      // Solange Merlin zuhört oder nachdenkt, zeigt er das Zuhör-Bild
      const aktiv = name === "hoert" || name === "denkt";
      figur.classList.toggle("aktiv", aktiv);
      bild.src = aktiv ? BILD.hoert : BILD.ruhig;
      $("#merlin-mikro-text").textContent = name === "hoert" ? (lauscht ? "Ich höre zu …" : "Ich höre zu … zum Beenden noch einmal klicken") : GRUND_TEXT();
      if (!name && frage.textContent === "Einen Moment …") frage.innerHTML = startText;
    },
  });
  addEventListener("pagehide", () => { abmelden(); navi.hoerAbbrechen(); });
}
$("#titel").textContent = modus === "start" ? "Was möchtest du abhalten?" : "Meeting Assistent";
$("#unterzeile").textContent = modus === "start" ? "" : "Richte ein neues Meeting ein oder öffne ein bestehendes.";

/** Richtet das erste Auswahlfeld links an der Oberkante des ersten Kastens im Hauptfenster aus. */
function richteAus() {
  const wahl = $("#wahl");
  wahl.style.marginTop = "";
  const ziel = $("#b-meeting");
  if (modus === "start" || matchMedia("(max-width: 900px)").matches) return;
  const versatz = ziel.getBoundingClientRect().top - wahl.getBoundingClientRect().top;
  if (versatz > 0) wahl.style.marginTop = `${versatz}px`;
}
addEventListener("resize", richteAus);
document.fonts?.ready.then(richteAus);
richteAus();

// ── Meetings (ohne die Meetings, die zu einem Workshop gehören: die öffnet man unter "Workshop") ──
let stand = null;
let meetingKennung = "";
async function ladeMeetings() {
  const meetings = (await (await fetch("/api/tage")).json()).filter((m) => !m.workshop);
  const offenId = stand?.tag?.id ?? "";
  const kennung = JSON.stringify([meetings.map((m) => [m.id, m.name, m.datum, m.abgeschlossen]), offenId]);
  if (kennung === meetingKennung) return;
  meetingKennung = kennung;
  const wahl = $("#m-wahl");
  const vorher = wahl.value;
  const gruppe = (titel, liste) => {
    const g = el("optgroup");
    g.label = titel;
    g.append(...liste.map((m) => option(m.id, `${m.name} · ${datum(m.datum)}${m.id === offenId ? " (geöffnet)" : ""}`)));
    return g;
  };
  const offene = meetings.filter((m) => !m.abgeschlossen);
  const fertige = meetings.filter((m) => m.abgeschlossen);
  wahl.replaceChildren(option("", meetings.length ? "Bitte wählen …" : "Noch kein Meeting angelegt"));
  if (offene.length) wahl.append(gruppe("Offene Meetings", offene));
  if (fertige.length) wahl.append(gruppe("Abgeschlossen (wieder öffnen)", fertige));
  wahl.value = [...wahl.options].some((o) => o.value === vorher) && vorher ? vorher : [...wahl.options].some((o) => o.value === offenId) ? offenId : "";
  zeigeMeetingKnopf();
}
function zeigeMeetingKnopf() {
  const id = $("#m-wahl").value;
  const offenId = stand?.tag?.id ?? "";
  const laeuft = stand?.status.aufnahme && id && id !== offenId;
  $("#m-oeffnen").disabled = !id || laeuft;
  beschrifte("#m-oeffnen", "pfeil", id && id === offenId ? "Weiter mit diesem Meeting" : "Meeting öffnen");
  $("#m-info").textContent = laeuft ? "In einem anderen Meeting läuft gerade die Aufnahme. Bitte dort erst pausieren." : "";
}
$("#m-wahl").addEventListener("change", zeigeMeetingKnopf);

async function oeffneMeeting(id) {
  if (id !== (stand?.tag?.id ?? "")) await sende(`/api/tage/${id}/aktivieren`);
  gehe("assistent");
}
$("#m-oeffnen-formular").addEventListener("submit", (e) => {
  e.preventDefault();
  oeffneMeeting($("#m-wahl").value).catch((f) => melde(f.message));
});

const zeigeMeetingFelder = (an) => {
  $("#m-felder").hidden = !an;
  $("#m-neu").hidden = an;
  if (an) {
    if (!$("#m-datum").value) $("#m-datum").value = new Date().toLocaleDateString("sv-SE");
    $("#m-name").focus();
  }
};
$("#m-neu").addEventListener("click", () => zeigeMeetingFelder(true));
$("#m-abbrechen").addEventListener("click", () => zeigeMeetingFelder(false));
$("#m-formular").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    if (stand?.status.aufnahme) throw new Error("In einem Meeting läuft gerade die Aufnahme. Bitte dort erst pausieren.");
    const agenda = $("#m-agenda").value.split("\n").map((z) => z.trim()).filter(Boolean);
    const { id } = await sende("/api/tage", { name: $("#m-name").value, datum: $("#m-datum").value, agenda });
    $("#m-formular").reset();
    zeigeMeetingFelder(false);
    await oeffneMeeting(id);
  } catch (fehler) {
    melde(fehler.message);
  }
});

beschrifte("#m-neu", "plus", "Neues Meeting einrichten");
beschrifte("#m-anlegen", "plus", "Einrichten und öffnen");

// Auftrag von Merlin ("Neues Meeting …"): Formular öffnen und, falls genannt, den Namen eintragen
try {
  const auftrag = JSON.parse(sessionStorage.getItem("merlin-auftrag") ?? "null");
  sessionStorage.removeItem("merlin-auftrag");
  if (auftrag?.aktion === "meeting-neu" && modus === "meeting") {
    zeigeMeetingFelder(true);
    if (auftrag.name) { $("#m-name").value = auftrag.name; $("#m-agenda").focus(); }
  }
} catch {}
beschrifte("#m-abbrechen", "x", "Abbrechen");
// Wer "Meeting" wählt, will meist ein neues einrichten: Formular gleich offen
if (modus === "meeting" && $("#m-felder").hidden) zeigeMeetingFelder(true);

verbinde((daten) => {
  stand = daten;
  if (modus === "meeting") ladeMeetings();
});
