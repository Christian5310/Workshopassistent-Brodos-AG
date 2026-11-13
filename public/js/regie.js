import { el, fuelleAgentenWahl, icon, imRahmen, merlin, sende, verbinde } from "./common.js";

imRahmen("regie");

const $ = (id) => document.querySelector(id);
let letzterZyklus = undefined;

async function ladeTranskript() {
  const abschnitte = await (await fetch("/api/transcript")).json();
  const ziel = $("#transkript");
  ziel.replaceChildren();
  if (!abschnitte.length) ziel.append(el("p", "", "Noch kein Transkript."));
  for (const a of abschnitte) {
    const p = el("div");
    p.append(el("time", "", new Date(a.zeit).toLocaleTimeString("de-DE")), a.text);
    ziel.append(p);
  }
  ziel.scrollTop = ziel.scrollHeight;
}

verbinde(({ status, chat, tag }) => {
  document.querySelector("#reset").replaceChildren(icon("trash"), tag ? `Inhalte von „${tag.name}" löschen` : "Kein Meeting geöffnet");
  document.querySelector("#reset").disabled = !tag;
  fuelleAgentenWahl($("#an"));
  $("#start").disabled = status.aufnahme || !tag;
  $("#pause").disabled = !status.aufnahme;
  $("#aufnahme-info").textContent = status.mock
    ? `Mock-Modus: Alle ${status.zyklusSekunden} s kommt ein Abschnitt aus dem Fake-Transkript.`
    : "";
  if (status.quelle === "mikro") $("#aufnahme-info").textContent = `Alle ${status.zyklusSekunden} s wird ein Audio-Abschnitt transkribiert. Diagnose, Text-Einspeisung und Löschen für die Moderation.`;
  $("#chat-info").textContent =
    status.chat === "denkt nach" ? "Die Spezial-Agenten denken nach …" : `${chat.length} Nachrichten im Verlauf. Antworten erscheinen bei den Spezial-Agenten.`;
  if (status.letzterZyklus !== letzterZyklus) {
    letzterZyklus = status.letzterZyklus;
    ladeTranskript();
    ladeDiagnose();
  }
});

async function ladeDiagnose() {
  const eintraege = await (await fetch("/api/regie/diagnose")).json();
  const ziel = $("#diagnose");
  ziel.replaceChildren();
  if (!eintraege.length) ziel.append(el("p", "", "Noch keine Abschnitte seit dem Start der App."));
  for (const e of eintraege.toReversed()) {
    const zeile = el("div", e.ok ? "" : "problem");
    zeile.append(el("time", "", new Date(e.zeit).toLocaleTimeString("de-DE")), el("b", "", e.ergebnis), el("div", "gehoert", e.text.length > 220 ? `${e.text.slice(0, 220)} …` : e.text));
    ziel.append(zeile);
  }
}
ladeDiagnose();

$("#textformular").addEventListener("submit", async (ereignis) => {
  ereignis.preventDefault();
  try {
    const { abschnitte } = await sende("/api/regie/text", { text: $("#einspeisen").value });
    $("#einspeisen").value = "";
    $("#chat-info").textContent = `${abschnitte} Abschnitt(e) werden verarbeitet …`;
  } catch (fehler) {
    $("#chat-info").textContent = fehler.message;
  }
});

const melde = (fehler) => ($("#chat-info").textContent = fehler.message);

$("#start").addEventListener("click", () => merlin().starten().catch(melde));
$("#pause").addEventListener("click", () => merlin().pausieren().catch(melde));
$("#reset").addEventListener("click", () => {
  if (confirm("Transkript, Protokoll und Chat dieses Meetings wirklich unwiderruflich löschen?")) sende("/api/regie/reset").catch(melde);
});
$("#formular").addEventListener("submit", (ereignis) => {
  ereignis.preventDefault();
  const text = $("#text").value.trim();
  if (!text) return;
  $("#text").value = "";
  sende("/api/chat", { text, an: $("#an").value }).catch(melde);
});

// Beschriftung der Knöpfe mit Linien-Icons
$("#start").replaceChildren(icon("play"), "Aufnahme starten");
$("#pause").replaceChildren(icon("pause"), "Pausieren");
$("#verarbeiten").replaceChildren(icon("pfeil"), "Verarbeiten");
$("#fragen").replaceChildren(icon("senden"), "Frage senden");
