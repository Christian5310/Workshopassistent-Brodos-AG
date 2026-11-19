import { AGENTEN, avatar, el, icon, imRahmen, sende, verbinde, zeigeAbhalten, zeigeChat } from "./common.js";

imRahmen("agenten");

const $ = (s) => document.querySelector(s);
const statusZeile = $("#chatstatus");
const formular = $("#formular");
const text = $("#text");

let hoerend = [];
let denkt = false;
let ohneMeeting = false;
let meldung = "";
let alleDabei = false;

function zeigeStatus() {
  if (ohneMeeting) return;
  const namen = hoerend.map((id) => AGENTEN.get(id)?.name).filter(Boolean).join(" und ");
  statusZeile.textContent =
    meldung ||
    (denkt
      ? "Die Agenten denken nach …"
      : hoerend.length
        ? `${namen} hört zu. Stelle deine Frage und klicke dann noch einmal auf den Agenten.`
        : "Klicke auf einen Agenten. Er hört zu, bis du ihn noch einmal anklickst, und antwortet dann.");
  formular.querySelector("button[type=submit]").disabled = denkt;
}

// Bühne: die Agenten als Figuren. Klick 1 = zuhören, Klick 2 = auswerten und antworten.
let buehneStand = "";
function zeigeBuehne(daten) {
  const stand = JSON.stringify([daten.agentenAlle, hoerend, denkt, !!daten.tag]);
  if (stand === buehneStand) return;
  buehneStand = stand;
  $("#buehne").replaceChildren(
    ...daten.agentenAlle.map((a) => {
      const knopf = el("button", `figur${hoerend.includes(a.id) ? " hoert" : ""}`);
      knopf.type = "button";
      knopf.disabled = !daten.tag || denkt;
      knopf.setAttribute("aria-pressed", String(hoerend.includes(a.id)));
      knopf.title = hoerend.includes(a.id) ? "Noch einmal klicken: auswerten und antworten" : "Klicken: zuhören";
      knopf.append(avatar(a, "gross"), el("span", "figur-name", a.name), el("span", "figur-zustand", hoerend.includes(a.id) ? "hört zu …" : ""));
      knopf.addEventListener("click", () => klick(a.id));
      return knopf;
    }),
  );
}

async function klick(id) {
  meldung = "";
  try {
    const antwort = await sende("/api/agenten-hoeren", { id });
    if (antwort.leer) meldung = "Nichts gehört. Hat die Aufnahme in der Zwischenzeit mitgelaufen? Sonst die Frage unten tippen.";
  } catch (fehler) {
    meldung = fehler.message;
  }
  zeigeStatus();
}

verbinde((daten) => {
  const { chat: nachrichten, status, tag } = daten;
  $("#meeting-name").textContent = tag ? tag.name : "Noch kein Meeting geöffnet";
  $("#abhalten").hidden = !tag;
  if (tag) zeigeAbhalten($("#abhalten"), "agenten", daten);
  ohneMeeting = tag === null;
  formular.hidden = ohneMeeting;
  $("#buehne").hidden = ohneMeeting;
  if (ohneMeeting) statusZeile.textContent = "Kein Meeting geöffnet. Bitte oben unter Meeting oder Workshop eines einrichten oder öffnen.";
  // Alle Agenten stehen auf der Bühne zur Verfügung
  if (tag && !alleDabei && daten.agenten.length < daten.agentenAlle.length) {
    alleDabei = true;
    sende(`/api/tage/${tag.id}/agenten`, { agenten: daten.agentenAlle.map((a) => a.id) }, "PUT").catch(() => (alleDabei = false));
  }
  hoerend = daten.hoerend ?? [];
  denkt = status.chat === "denkt nach";
  zeigeBuehne(daten);
  zeigeChat($("#chat"), nachrichten, denkt);
  zeigeStatus();
});

// Textfeld: Die Frage geht an den Agenten, der gerade zuhört, sonst an alle
formular.addEventListener("submit", async (ereignis) => {
  ereignis.preventDefault();
  const inhalt = text.value.trim();
  if (!inhalt || denkt) return;
  text.value = "";
  meldung = "";
  try {
    await sende("/api/chat", { an: hoerend.length === 1 ? hoerend[0] : "alle", text: inhalt });
  } catch (fehler) {
    meldung = fehler.message;
    zeigeStatus();
  }
});

$("#senden").replaceChildren(icon("senden"), "Senden");
