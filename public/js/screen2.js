import { ROLLEN, el, figur, sende, verbinde, zeigeChat, zeigeStatus } from "./common.js";

const chat = document.querySelector("#chat");
const statusZeile = document.querySelector("#chatstatus");
const formular = document.querySelector("#formular");
const text = document.querySelector("#text");
// Auswahl des Spezial-Agenten (ein Knopf ist immer aktiv)
const an = { value: "alle" };
const wahl = [...document.querySelectorAll("#an button")];
for (const knopf of wahl) {
  if (knopf.dataset.wert !== "alle") knopf.replaceChildren(figur(knopf.dataset.wert), el("span", "name", ROLLEN[knopf.dataset.wert].name));
  knopf.addEventListener("click", () => {
    an.value = knopf.dataset.wert;
    for (const k of wahl) k.setAttribute("aria-checked", String(k === knopf));
  });
}
const ptt = document.querySelector("#ptt");

let hoertZu = false;
let denkt = false;

function zeigeChatStatus(fehler = "") {
  statusZeile.textContent = fehler || (hoertZu ? "hört zu …" : denkt ? "denkt nach …" : "");
  ptt.classList.toggle("aktiv", hoertZu);
  formular.querySelector("button[type=submit]").disabled = denkt;
}

verbinde(({ chat: nachrichten, status }) => {
  zeigeStatus(status);
  for (const k of wahl) if (k.dataset.wert !== "alle") k.querySelector(".name").textContent = ROLLEN[k.dataset.wert].name;
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
