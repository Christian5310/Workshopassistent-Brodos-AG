import { el, sende, verbinde, zeigeStatus } from "./common.js";

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

verbinde(({ status, chat }) => {
  zeigeStatus(status);
  $("#start").disabled = status.aufnahme;
  $("#pause").disabled = !status.aufnahme;
  $("#aufnahme-info").textContent = status.mock
    ? `Mock-Modus: Alle ${status.zyklusSekunden} s kommt ein Abschnitt aus dem Fake-Transkript.`
    : `Alle ${status.zyklusSekunden} s wird ein Audio-Schnipsel transkribiert.`;
  $("#chat-info").textContent =
    status.chat === "denkt nach" ? "Die Spezial-Agenten denken nach …" : `${chat.length} Nachrichten im Verlauf. Antworten erscheinen bei den Spezial-Agenten.`;
  if (status.letzterZyklus !== letzterZyklus) {
    letzterZyklus = status.letzterZyklus;
    ladeTranskript();
  }
});

const melde = (fehler) => ($("#chat-info").textContent = fehler.message);

$("#start").addEventListener("click", () => sende("/api/regie/start").catch(melde));
$("#pause").addEventListener("click", () => sende("/api/regie/pause").catch(melde));
$("#reset").addEventListener("click", () => {
  if (confirm("Transkript, Protokoll und Chat wirklich unwiderruflich löschen?")) sende("/api/regie/reset").catch(melde);
});
$("#formular").addEventListener("submit", (ereignis) => {
  ereignis.preventDefault();
  const text = $("#text").value.trim();
  if (!text) return;
  $("#text").value = "";
  sende("/api/chat", { text, an: $("#an").value }).catch(melde);
});
