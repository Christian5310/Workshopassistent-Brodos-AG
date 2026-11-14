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

$("#b-start").hidden = modus !== "start";
$("#b-meeting").hidden = modus !== "meeting";
$("#titel").textContent = modus === "start" ? "Was möchtest du abhalten?" : "Meeting Assistent";
$("#unterzeile").textContent = modus === "start" ? "Wähle links oder hier: Meeting oder Workshop." : "Richte ein neues Meeting ein oder öffne ein bestehendes.";
$("#b-start").replaceChildren(
  ...Object.entries(WEGE).map(([id, w]) => {
    const k = el("button", "kachel");
    k.type = "button";
    const kreis = el("span", "kreis");
    kreis.append(icon(w.icon));
    k.append(kreis, el("span", "kachel-titel", w.name), el("span", "kachel-text", w.text));
    k.addEventListener("click", () => gehe(id));
    return k;
  }),
);

/** Richtet das erste Auswahlfeld links an der Oberkante des ersten Kastens im Hauptfenster aus. */
function richteAus() {
  const wahl = $("#wahl");
  wahl.style.marginTop = "";
  const ziel = modus === "start" ? $("#b-start") : $("#b-meeting");
  if (matchMedia("(max-width: 900px)").matches) return;
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
beschrifte("#m-abbrechen", "x", "Abbrechen");

verbinde((daten) => {
  stand = daten;
  if (modus === "meeting") ladeMeetings();
});
