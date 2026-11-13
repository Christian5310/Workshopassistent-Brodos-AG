import { AGENTEN, el, gehe, icon, imRahmen, sende, verbinde, zeigeChat } from "./common.js";

imRahmen("agenten");

const chat = document.querySelector("#chat");
const statusZeile = document.querySelector("#chatstatus");
const formular = document.querySelector("#formular");
const text = document.querySelector("#text");
// Auswahlfeld links: "Alle Agenten", die bestehenden Agenten und der Weg zur Neuanlage (Übersicht)
const NEU = "__neu__";
const an = { value: "alle" };
const wahl = document.querySelector("#agentwahl");
let wahlStand = "";
/** In der Übersicht gewählter Agent: wird einmalig übernommen. */
let gewuenscht = null;
try { gewuenscht = sessionStorage.getItem("broki-agent"); sessionStorage.removeItem("broki-agent"); } catch {}

function zeigeWahl() {
  const stand = JSON.stringify([...AGENTEN.values()]);
  if (stand === wahlStand) return;
  wahlStand = stand;
  const vorher = gewuenscht ?? wahl.value ?? an.value;
  const option = (wert, text) => { const o = el("option", "", text); o.value = wert; return o; };
  wahl.replaceChildren(option("alle", "Alle Agenten"), ...[...AGENTEN.values()].map((a) => option(a.id, a.name)), option(NEU, "Neuen Agenten anlegen …"));
  wahl.value = [...wahl.options].some((o) => o.value === vorher) && vorher !== NEU ? vorher : "alle";
  if (wahl.value === gewuenscht || AGENTEN.size) gewuenscht = null;
  an.value = wahl.value;
}
wahl.addEventListener("change", () => {
  if (wahl.value === NEU) {
    try { sessionStorage.setItem("broki-uebersicht", "agenten"); } catch {}
    return void gehe("uebersicht");
  }
  an.value = wahl.value;
});

let hoertZu = false;
let denkt = false;

function zeigeChatStatus(fehler = "") {
  if (ohneMeeting && !fehler) return;
  statusZeile.textContent = fehler || (hoertZu ? "hört zu …" : denkt ? "denkt nach …" : "Antworten nur auf Frage, per Sprache oder Text.");
  ptt.classList.toggle("hoert", hoertZu);
  formular.querySelector("button[type=submit]").disabled = denkt;
}

let ohneMeeting = false;
verbinde(({ chat: nachrichten, status, tag }) => {
  ohneMeeting = tag === null;
  document.querySelector("#formular").hidden = ohneMeeting;
  if (ohneMeeting) statusZeile.textContent = "Kein Meeting geöffnet. Bitte in der Übersicht ein Meeting anlegen oder öffnen.";
  zeigeWahl();
  denkt = status.chat === "denkt nach";
  quelle = status.quelle;
  zeigeChat(chat, nachrichten, denkt);
  zeigeChatStatus();
});

async function frage(daten) {
  try {
    await sende("/api/chat", { an: an.value, ...daten });
  } catch (fehler) {
    zeigeChatStatus(fehler.message);
  }
}

formular.addEventListener("submit", (ereignis) => {
  ereignis.preventDefault();
  const inhalt = text.value.trim();
  if (!inhalt || denkt) return;
  text.value = "";
  frage({ text: inhalt });
});

// Push-to-Talk: halten = zuhören, loslassen = abschicken.
// Im Mock-Modus gibt es noch keine Aufnahme; der Server liefert eine Beispiel-Frage (echtes Audio: Schritt 6).
// Mit echtem Mikrofon (quelle "mikro") wird aufgenommen und beim Loslassen transkribiert.
let quelle = "timer";
let strom = null;
let rekorder = null;

async function pttStart() {
  if (hoertZu || denkt) return;
  hoertZu = true;
  zeigeChatStatus();
  if (quelle !== "mikro") return;
  try {
    strom ??= await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    if (!hoertZu) return; // schon wieder losgelassen, während der Browser nach dem Mikrofon gefragt hat
    const teile = [];
    const r = new MediaRecorder(strom, { audioBitsPerSecond: 32000 });
    r.addEventListener("dataavailable", (e) => e.data.size && teile.push(e.data));
    r.addEventListener("stop", async () => {
      const blob = new Blob(teile, { type: r.mimeType || "audio/webm" });
      try {
        const antwort = await fetch(`/api/chat-audio?an=${an.value}`, { method: "POST", headers: { "Content-Type": blob.type.split(";")[0] }, body: blob });
        if (!antwort.ok) throw new Error((await antwort.json().catch(() => ({}))).fehler ?? `Fehler ${antwort.status}`);
      } catch (fehler) {
        zeigeChatStatus(fehler.message);
      }
    });
    r.start();
    rekorder = r;
  } catch (fehler) {
    hoertZu = false;
    zeigeChatStatus(fehler.name === "NotAllowedError" ? "Kein Zugriff auf das Mikrofon. Bitte im Browser erlauben." : "Mikrofon lässt sich nicht öffnen. Die Frage bitte tippen.");
  }
}
function pttEnde() {
  if (!hoertZu) return;
  hoertZu = false;
  zeigeChatStatus();
  if (quelle !== "mikro") return void frage({ sprache: true });
  if (rekorder?.state === "recording") rekorder.stop();
  rekorder = null;
}
ptt.addEventListener("pointerdown", pttStart);
ptt.addEventListener("pointerup", pttEnde);
ptt.addEventListener("pointerleave", pttEnde);

const imFeld = () => ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName);
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !e.repeat && !imFeld()) { e.preventDefault(); pttStart(); }
});
document.addEventListener("keyup", (e) => {
  if (e.code === "Space" && hoertZu) { e.preventDefault(); pttEnde(); }
});

// Beschriftung der Knöpfe mit Linien-Icons
ptt.replaceChildren(icon("mic"), "Halten zum Sprechen");
document.querySelector("#senden").replaceChildren(icon("senden"), "Senden");
