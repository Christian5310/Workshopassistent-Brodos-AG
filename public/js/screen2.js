import { AGENTEN, el, icon, imRahmen, sende, verbinde, zeigeChat } from "./common.js";

imRahmen("agenten");

const chat = document.querySelector("#chat");
const statusZeile = document.querySelector("#chatstatus");
const formular = document.querySelector("#formular");
const text = document.querySelector("#text");
// Auswahlfeld links: "Alle Agenten", die bestehenden Agenten und "Neuen Agenten anlegen"
const NEU = "__neu__";
const an = { value: "alle" };
const wahl = document.querySelector("#agentwahl");
let wahlStand = "";
function zeigeWahl() {
  const stand = JSON.stringify([...AGENTEN.values()]);
  if (stand !== wahlStand) {
    wahlStand = stand;
    const vorher = wahl.value || an.value;
    const option = (wert, text) => { const o = el("option", "", text); o.value = wert; return o; };
    const gruppe = el("optgroup");
    gruppe.label = "Bestehenden Agenten fragen";
    gruppe.append(...[...AGENTEN.values()].map((a) => option(a.id, a.name)));
    wahl.replaceChildren(option("alle", "Alle Agenten"), gruppe, option(NEU, "Neuen Agenten anlegen"));
    wahl.value = [...wahl.options].some((o) => o.value === (gewuenscht ?? vorher)) ? (gewuenscht ?? vorher) : "alle";
    if (wahl.value === gewuenscht) gewuenscht = null;
  }
  const neu = wahl.value === NEU;
  if (!neu) an.value = wahl.value;
  document.querySelector("#agent-neu").hidden = !neu;
  document.querySelector("#chat").hidden = neu;
  document.querySelector("#formular").hidden = neu || ohneMeeting;
}
/** ID eines gerade angelegten Agenten: wird ausgewählt, sobald er in der Liste erscheint. */
let gewuenscht = null;
wahl.addEventListener("change", () => {
  zeigeWahl();
  if (wahl.value === NEU) document.querySelector("#a-name").focus();
});

// ── Neuen Agenten anlegen ──
const $a = (id) => document.querySelector(id);
const zaehle = () => ($a("#a-zaehler").textContent = $a("#a-wissen").value.length ? `${$a("#a-wissen").value.length.toLocaleString("de-DE")} Zeichen` : "leer");
$a("#a-wissen").addEventListener("input", zaehle);
$a("#a-laden").addEventListener("click", () => $a("#a-datei").click());
$a("#a-datei").addEventListener("change", async () => {
  const texte = await Promise.all([...$a("#a-datei").files].map((f) => f.text()));
  const neu = [$a("#a-wissen").value.trim(), ...texte.map((t) => t.trim())].filter(Boolean).join("\n\n");
  if (neu.length > 300000) return void ($a("#a-meldung").textContent = "Zu groß: höchstens 300.000 Zeichen.");
  $a("#a-wissen").value = neu;
  $a("#a-datei").value = "";
  zaehle();
});
$a("#a-abbrechen").addEventListener("click", () => { wahl.value = an.value; zeigeWahl(); });
$a("#agentformular").addEventListener("submit", async (ereignis) => {
  ereignis.preventDefault();
  try {
    const farben = ["#0069b4", "#004080", "#31435e"];
    const { id } = await sende("/api/agenten", { name: $a("#a-name").value, beschreibung: $a("#a-prompt").value, wissen: $a("#a-wissen").value, figur: $a("#a-symbol").value, farbe: farben[AGENTEN.size % farben.length] });
    $a("#agentformular").reset();
    zaehle();
    $a("#a-meldung").textContent = "";
    gewuenscht = id; // das Update vom Server bringt den neuen Agenten in die Liste
    wahlStand = "";
    if (AGENTEN.has(id)) zeigeWahl();
  } catch (fehler) {
    $a("#a-meldung").textContent = fehler.message;
  }
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
  if (ohneMeeting) statusZeile.textContent = "Kein Meeting geöffnet. Bitte im Transkriptions-Assistenten ein Meeting auswählen.";
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
$a("#a-laden").replaceChildren(icon("plus"), "Datei laden (.md)");
$a("#a-anlegen").replaceChildren(icon("plus"), "Agent anlegen");
$a("#a-abbrechen").replaceChildren(icon("x"), "Abbrechen");
document.querySelector("#senden").replaceChildren(icon("senden"), "Senden");
