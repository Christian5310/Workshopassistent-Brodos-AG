import { el, figur, sende } from "./common.js";

const $ = (id) => document.querySelector(id);
const ROLLEN = ["sales", "bpm", "consultant"];
let standard = null;
let ungespeichert = false;

const melde = (text) => ($("#meldung").textContent = text);

function fuelle(e) {
  $("#briefing").value = e.briefing;
  $("#begriffe").value = e.begriffe;
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
    text.rows = 4;
    const kopf = el("div", "agentkopf");
    kopf.append(figur(rolle), name);

    // Wissensdatei: Text einfügen oder .md/.txt-Datei laden (bleibt im Browser, bis gespeichert wird)
    const wissen = el("textarea", "mono");
    wissen.id = `wissen-${rolle}`;
    wissen.rows = 6;
    wissen.maxLength = 300000;
    wissen.placeholder = "Noch keine Wissensdatei. Text einfügen oder Datei laden.";
    wissen.value = e.agenten[rolle].wissen;
    wissen.setAttribute("aria-label", "Wissensdatei");
    const zaehler = el("span", "zaehler");
    const zaehle = () => (zaehler.textContent = wissen.value.length ? `${wissen.value.length.toLocaleString("de-DE")} Zeichen` : "leer");
    wissen.addEventListener("input", zaehle);
    zaehle();
    const datei = el("input");
    datei.type = "file";
    datei.accept = ".md,.txt,text/markdown,text/plain";
    datei.multiple = true;
    datei.hidden = true;
    datei.addEventListener("change", async () => {
      const texte = await Promise.all([...datei.files].map((f) => f.text()));
      const neu = [wissen.value.trim(), ...texte.map((t) => t.trim())].filter(Boolean).join("\n\n");
      if (neu.length > 300000) return void melde("Die Wissensdatei ist zu groß (maximal 300.000 Zeichen pro Agent).");
      wissen.value = neu;
      datei.value = "";
      wissen.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const laden = el("button", "zweit klein", "Datei laden (.md)");
    laden.type = "button";
    laden.addEventListener("click", () => datei.click());
    const leeren = el("button", "zweit klein", "Leeren");
    leeren.type = "button";
    leeren.addEventListener("click", () => {
      wissen.value = "";
      wissen.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const leiste = el("div", "wissenleiste");
    leiste.append(el("b", "", "Wissen"), zaehler, laden, leeren, datei);
    karte.append(kopf, text, leiste, wissen);
    ziel.append(karte);
  }
}

function lies() {
  return {
    briefing: $("#briefing").value,
    begriffe: $("#begriffe").value,
    promptAssistent: $("#promptAssistent").value,
    promptAgenten: $("#promptAgenten").value,
    promptZusammenfassung: $("#promptZusammenfassung").value,
    maxTodosProZyklus: Number($("#maxTodos").value),
    agenten: Object.fromEntries(
      ROLLEN.map((r) => [r, { name: $(`#name-${r}`).value, beschreibung: $(`#beschreibung-${r}`).value, wissen: $(`#wissen-${r}`).value }]),
    ),
  };
}

async function ladeVorschau() {
  const { promptAgenten, zeichen } = await (await fetch("/api/admin/vorschau")).json();
  $("#vorschau pre").textContent = promptAgenten;
  $("#vorschau summary").textContent = `Vorschau: so bekommt ihn das Sprachmodell bei „Frage an alle" (${zeichen.toLocaleString("de-DE")} Zeichen, letzter gespeicherter Stand)`;
}

async function lade() {
  const daten = await (await fetch("/api/admin/einstellungen")).json();
  standard = daten.standard;
  fuelle(daten.einstellungen);
  $("#hinweis").textContent = daten.mock
    ? "Mock-Modus: Tage, Agenda, Namen und die To-do-Bremse wirken sofort. Prompts und Hintergrundwissen werden gespeichert, wirken aber erst, wenn ein echtes Sprachmodell angebunden ist."
    : "";
  ladeVorschau();
}

$("#formular").addEventListener("input", (ereignis) => {
  if (ereignis.target.closest("#tage")) return; // Tage haben ihren eigenen Speichern-Knopf
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

// ── Tage und Agenda ──
let tage = [];
const tagMelde = (text) => ($("#tag-meldung").textContent = text);
const tagEingabe = () => ({
  name: $("#tag-name").value,
  datum: $("#tag-datum").value,
  agenda: $("#tag-agenda").value.split("\n").map((z) => z.trim()).filter(Boolean),
});
function zeigeTag(id) {
  const tag = tage.find((t) => t.id === id) ?? tage[0];
  if (!tag) return;
  $("#tag-wahl").value = tag.id;
  $("#tag-name").value = tag.name;
  $("#tag-datum").value = tag.datum;
  $("#tag-agenda").value = tag.agenda.join("\n");
}
async function ladeTage(waehle) {
  tage = await (await fetch("/api/tage")).json();
  const wahl = $("#tag-wahl");
  wahl.replaceChildren(
    ...tage.map((t) => {
      const o = el("option", "", `${new Date(`${t.datum}T12:00:00`).toLocaleDateString("de-DE")} · ${t.name}${t.aktiv ? " (aktiv)" : ""}`);
      o.value = t.id;
      return o;
    }),
  );
  zeigeTag(waehle ?? tage.find((t) => t.aktiv)?.id);
}
$("#tag-wahl").addEventListener("change", () => { zeigeTag($("#tag-wahl").value); tagMelde(""); });
$("#tag-speichern").addEventListener("click", async () => {
  try {
    const id = $("#tag-wahl").value;
    await sende(`/api/tage/${id}`, tagEingabe(), "PUT");
    await ladeTage(id);
    tagMelde("Tag gespeichert.");
  } catch (fehler) { tagMelde(fehler.message); }
});
$("#tag-neu").addEventListener("click", async () => {
  try {
    const { id } = await sende("/api/tage", tagEingabe());
    await ladeTage(id);
    tagMelde("Neuer Tag angelegt. Auswählen kannst du ihn im Transkriptions-Assistenten.");
  } catch (fehler) { tagMelde(fehler.message); }
});
$("#tag-loeschen").addEventListener("click", async () => {
  const tag = tage.find((t) => t.id === $("#tag-wahl").value);
  if (!tag || !confirm(`„${tag.name}" mit Transkript, To-dos und Fragen wirklich unwiderruflich löschen?`)) return;
  try {
    await sende(`/api/tage/${tag.id}`, {}, "DELETE");
    await ladeTage();
    tagMelde("Tag gelöscht.");
  } catch (fehler) { tagMelde(fehler.message); }
});

lade();
ladeTage();
