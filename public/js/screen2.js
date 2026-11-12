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
function pttStart() {
  if (hoertZu || denkt) return;
  hoertZu = true;
  zeigeChatStatus();
}
function pttEnde() {
  if (!hoertZu) return;
  hoertZu = false;
  zeigeChatStatus();
  frage({ sprache: true });
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
