import { AGENTEN, avatar, el, icon, imRahmen, merlin, sende, verbinde, zeigeAbhalten, zeigeChat } from "./common.js";

imRahmen("agenten");

const $ = (s) => document.querySelector(s);
const statusZeile = $("#chatstatus");
const formular = $("#formular");
const text = $("#text");

let denkt = false;
let ohneMeeting = false;
let meldung = "";
let alleDabei = false;
let quelle = "timer";
let letzteDaten = null;

// Zuhören: ein Agent zurzeit. Klick 1 = Mikrofon auf, Klick 2 = auswerten und antworten (Audio wird danach verworfen).
let zuhoerer = null; // { id, rekorder, strom }
const stumm = (an) => { const a = merlin()?.aufnahme; if (a) a.stumm = an; };

function zeigeStatus() {
  if (ohneMeeting) return;
  const name = zuhoerer ? AGENTEN.get(zuhoerer.id)?.name : "";
  statusZeile.textContent =
    meldung ||
    (denkt
      ? "Die Agenten denken nach …"
      : zuhoerer
        ? `${name} hört zu. Stelle deine Frage und klicke dann noch einmal auf den Agenten.`
        : "Klicke auf einen Agenten. Er hört zu, bis du ihn noch einmal anklickst, und antwortet dann sofort.");
  formular.querySelector("button[type=submit]").disabled = denkt;
}

// Bühne: die Agenten als Figuren
let buehneStand = "";
function zeigeBuehne() {
  if (!letzteDaten) return;
  const daten = letzteDaten;
  const stand = JSON.stringify([daten.agentenAlle, zuhoerer?.id, denkt, !!daten.tag]);
  if (stand === buehneStand) return;
  buehneStand = stand;
  $("#buehne").replaceChildren(
    ...daten.agentenAlle.map((a) => {
      const hoert = zuhoerer?.id === a.id;
      const knopf = el("button", `figur${hoert ? " hoert" : ""}`);
      knopf.type = "button";
      knopf.disabled = !daten.tag || denkt;
      knopf.setAttribute("aria-pressed", String(hoert));
      knopf.title = hoert ? "Noch einmal klicken: auswerten und antworten" : "Klicken: zuhören";
      knopf.append(avatar(a, "gross"), el("span", "figur-name", a.name), el("span", "figur-zustand", hoert ? "hört zu …" : ""));
      knopf.addEventListener("click", () => klick(a.id));
      return knopf;
    }),
  );
}

const neuZeichnen = () => { buehneStand = ""; zeigeBuehne(); zeigeStatus(); };

function aufraeumen() {
  zuhoerer?.strom?.getTracks().forEach((t) => t.stop());
  zuhoerer = null;
  stumm(false);
}

async function klick(id) {
  meldung = "";
  if (zuhoerer?.id === id) return void auswerten();
  if (zuhoerer) aufraeumen(); // anderer Agent angeklickt: Wechsel
  zuhoerer = { id, rekorder: null, strom: null };
  neuZeichnen();
  if (quelle !== "mikro") return; // Mock: keine echte Aufnahme
  try {
    const strom = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    if (zuhoerer?.id !== id) return void strom.getTracks().forEach((t) => t.stop()); // schon wieder abgebrochen
    const teile = [];
    const r = new MediaRecorder(strom, { audioBitsPerSecond: 32000 });
    r.addEventListener("dataavailable", (e) => e.data.size && teile.push(e.data));
    r.teile = teile;
    zuhoerer.rekorder = r;
    zuhoerer.strom = strom;
    stumm(true); // die Frage soll nicht ins Protokoll
    r.start();
  } catch (fehler) {
    aufraeumen();
    meldung = fehler.name === "NotAllowedError" ? "Kein Zugriff auf das Mikrofon. Bitte im Browser erlauben oder die Frage tippen." : "Mikrofon lässt sich nicht öffnen. Bitte die Frage tippen.";
    neuZeichnen();
  }
}

async function auswerten() {
  const { id, rekorder } = zuhoerer;
  try {
    if (quelle !== "mikro") {
      aufraeumen();
      neuZeichnen();
      await sende("/api/chat", { an: id, sprache: true });
      return;
    }
    if (!rekorder) throw new Error("Das Mikrofon ist noch nicht bereit. Bitte noch einmal klicken.");
    const blob = await new Promise((fertig) => {
      rekorder.addEventListener("stop", () => fertig(new Blob(rekorder.teile, { type: rekorder.mimeType || "audio/webm" })), { once: true });
      rekorder.stop();
    });
    aufraeumen();
    neuZeichnen();
    statusZeile.textContent = "Einen Moment …";
    const antwort = await fetch(`/api/chat-audio?an=${id}`, { method: "POST", headers: { "Content-Type": blob.type.split(";")[0] }, body: blob });
    if (!antwort.ok) throw new Error((await antwort.json().catch(() => ({}))).fehler ?? `Fehler ${antwort.status}`);
  } catch (fehler) {
    aufraeumen();
    meldung = fehler.message;
  }
  neuZeichnen();
}

verbinde((daten) => {
  const { chat: nachrichten, status, tag } = daten;
  letzteDaten = daten;
  quelle = status.quelle;
  $("#kontext-titel").textContent = daten.workshop ? "Workshop" : "Meeting";
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
  denkt = status.chat === "denkt nach";
  zeigeBuehne();
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
  const an = zuhoerer?.id ?? "alle";
  aufraeumen();
  neuZeichnen();
  try {
    await sende("/api/chat", { an, text: inhalt });
  } catch (fehler) {
    meldung = fehler.message;
    zeigeStatus();
  }
});

window.addEventListener("pagehide", aufraeumen);
$("#senden").replaceChildren(icon("senden"), "Senden");
