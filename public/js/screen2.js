import { AGENTEN, el, icon, imRahmen, sende, verbinde, zeigeAbhalten, zeigeChat } from "./common.js";

imRahmen("agenten");

const chat = document.querySelector("#chat");
const statusZeile = document.querySelector("#chatstatus");
const formular = document.querySelector("#formular");
const text = document.querySelector("#text");
// "Frage an": Alle teilnehmenden Agenten oder einer davon
const an = { value: "alle" };
const wahl = document.querySelector("#agentwahl");
let wahlStand = "";
function zeigeWahl() {
  const stand = JSON.stringify([...AGENTEN.values()]);
  if (stand === wahlStand) return;
  wahlStand = stand;
  const vorher = wahl.value || an.value;
  const option = (wert, text) => { const o = el("option", "", text); o.value = wert; return o; };
  wahl.replaceChildren(option("alle", "An alle"), ...[...AGENTEN.values()].map((a) => option(a.id, a.name)));
  wahl.value = [...wahl.options].some((o) => o.value === vorher) ? vorher : "alle";
  an.value = wahl.value;
}
wahl.addEventListener("change", () => (an.value = wahl.value));

// Agenten hinzufügen: Haken setzen = der Agent nimmt an diesem Meeting bzw. Workshop teil
let listeStand = "";
function zeigeAgentenliste(daten) {
  const kennung = JSON.stringify([daten.agentenAlle, daten.agenten.map((a) => a.id), daten.tag?.id]);
  if (kennung === listeStand) return;
  listeStand = kennung;
  const dabei = new Set(daten.agenten.map((a) => a.id));
  document.querySelector("#agentenliste").replaceChildren(
    ...daten.agentenAlle.map((a) => {
      const zeile = el("label", `select-item agentenwahl${dabei.has(a.id) ? " ist-dabei" : ""}`);
      const haken = el("input");
      haken.type = "checkbox";
      haken.checked = dabei.has(a.id);
      haken.disabled = !daten.tag;
      haken.addEventListener("change", async () => {
        const neu = daten.agentenAlle.map((x) => x.id).filter((id) => (id === a.id ? haken.checked : dabei.has(id)));
        try {
          await sende(`/api/tage/${daten.tag.id}/agenten`, { agenten: neu }, "PUT");
        } catch (fehler) {
          zeigeChatStatus(fehler.message);
        }
      });
      zeile.append(haken, icon(a.figur), el("span", "", a.name));
      return zeile;
    }),
  );
}

let hoertZu = false;
let denkt = false;

function zeigeChatStatus(fehler = "") {
  if (ohneMeeting && !fehler) return;
  statusZeile.textContent = fehler || (hoertZu ? "hört zu …" : denkt ? "denkt nach …" : AGENTEN.size ? "Antworten nur auf Frage, per Sprache oder Text." : "Noch kein Agent dabei. Hake links mindestens einen an.");
  ptt.classList.toggle("hoert", hoertZu);
  formular.querySelector("button[type=submit]").disabled = denkt;
}

let ohneMeeting = false;
verbinde((daten) => {
  const { chat: nachrichten, status, tag } = daten;
  document.querySelector("#kontext-titel").textContent = daten.workshop ? "Workshop" : "Meeting";
  document.querySelector("#meeting-name").textContent = tag ? tag.name : "Noch kein Meeting geöffnet";
  zeigeAgentenliste(daten);
  document.querySelector("#abhalten").hidden = !tag;
  if (tag) zeigeAbhalten(document.querySelector("#abhalten"), "agenten", daten);
  ohneMeeting = tag === null;
  document.querySelector("#formular").hidden = ohneMeeting;
  if (ohneMeeting) statusZeile.textContent = "Kein Meeting geöffnet. Bitte oben unter Meeting oder Workshop eines einrichten oder öffnen.";
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
