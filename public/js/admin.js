import { el, figur, sende } from "./common.js";

const $ = (id) => document.querySelector(id);
const ROLLEN = ["sales", "bpm", "consultant"];
let standard = null;
let ungespeichert = false;

const melde = (text) => ($("#meldung").textContent = text);

function fuelle(e) {
  $("#agenda").value = e.agenda.join("\n");
  $("#briefing").value = e.briefing;
  $("#promptAssistent").value = e.promptAssistent;
  $("#promptAgenten").value = e.promptAgenten;
  $("#promptZusammenfassung").value = e.promptZusammenfassung;
  $("#maxTodos").value = e.maxTodosProZyklus;
  const ziel = $("#agenten");
  ziel.replaceChildren();
  for (const rolle of ROLLEN) {
    const karte = el("div", `agent ${rolle}`);
    const name = el("input");
    name.type = "text";
    name.id = `name-${rolle}`;
    name.maxLength = 40;
    name.required = true;
    name.value = e.agenten[rolle].name;
    name.setAttribute("aria-label", "Name");
    const text = el("textarea");
    text.id = `beschreibung-${rolle}`;
    text.rows = 5;
    text.value = e.agenten[rolle].beschreibung;
    text.setAttribute("aria-label", "Rollenbeschreibung");
    const kopf = el("div", "agentkopf");
    kopf.append(figur(rolle), name);
    karte.append(kopf, text);
    ziel.append(karte);
  }
}

function lies() {
  return {
    agenda: $("#agenda").value.split("\n").map((z) => z.trim()).filter(Boolean),
    briefing: $("#briefing").value,
    promptAssistent: $("#promptAssistent").value,
    promptAgenten: $("#promptAgenten").value,
    promptZusammenfassung: $("#promptZusammenfassung").value,
    maxTodosProZyklus: Number($("#maxTodos").value),
    agenten: Object.fromEntries(
      ROLLEN.map((r) => [r, { name: $(`#name-${r}`).value, beschreibung: $(`#beschreibung-${r}`).value }]),
    ),
  };
}

async function ladeVorschau() {
  const { promptAgenten } = await (await fetch("/api/admin/vorschau")).json();
  $("#vorschau pre").textContent = promptAgenten;
}

async function lade() {
  const daten = await (await fetch("/api/admin/einstellungen")).json();
  standard = daten.standard;
  fuelle(daten.einstellungen);
  $("#hinweis").textContent = daten.mock
    ? "Mock-Modus: Agenda, Namen und die To-do-Bremse wirken sofort. Prompts und Hintergrundwissen werden gespeichert, wirken aber erst, wenn ein echtes Sprachmodell angebunden ist."
    : "";
  ladeVorschau();
}

$("#formular").addEventListener("input", () => {
  ungespeichert = true;
  melde("Ungespeicherte Änderungen");
});

$("#formular").addEventListener("submit", async (ereignis) => {
  ereignis.preventDefault();
  try {
    await sende("/api/admin/einstellungen", lies(), "PUT");
    ungespeichert = false;
    melde(`Gespeichert um ${new Date().toLocaleTimeString("de-DE")}. Gilt ab dem nächsten Zyklus bzw. der nächsten Frage.`);
    ladeVorschau();
  } catch (fehler) {
    melde(fehler.message);
  }
});

for (const knopf of document.querySelectorAll("[data-standard]")) {
  knopf.addEventListener("click", () => {
    const feld = knopf.dataset.standard;
    if (!confirm("Diesen Prompt auf den Standard zurücksetzen? Wirksam erst nach dem Speichern.")) return;
    $(`#${feld}`).value = standard[feld];
    ungespeichert = true;
    melde("Ungespeicherte Änderungen");
  });
}

window.addEventListener("beforeunload", (ereignis) => {
  if (ungespeichert) ereignis.preventDefault();
});

lade();
