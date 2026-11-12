// Gemeinsame Helfer für alle drei Ansichten. Kein Build-Schritt, kein Framework.

/** Spezial-Agenten (aus der Admin-Ansicht): id → { name, figur, farbe }. Wird mit jedem Update aktualisiert. */
export const AGENTEN = new Map();
export const agentName = (id, ersatz = "Agent") => AGENTEN.get(id)?.name ?? ersatz;

/** Kleines DOM-Helferlein; Text läuft immer über textContent (kein HTML aus Transkript/LLM). */
export function el(tag, klasse = "", text = "") {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text) e.textContent = text;
  return e;
}

/**
 * Hält die Ansicht live über Server-Sent Events.
 * Browser erlauben nur etwa sechs gleichzeitige Verbindungen pro Adresse. Damit viele offene Broki-Live-Tabs
 * (Assistent, Agenten, Regie, Admin, Archiv …) sich nicht gegenseitig blockieren, hält immer nur EIN Tab die
 * Verbindung zum Server und gibt die Updates über einen BroadcastChannel an die anderen Tabs weiter.
 */
export function verbinde(beiUpdate) {
  const anwenden = (stand) => {
    AGENTEN.clear();
    for (const a of stand.agenten ?? []) AGENTEN.set(a.id, a);
    beiUpdate(stand);
  };
  const direkt = () => {
    const quelle = new EventSource("/api/events"); // verbindet sich nach Abbrüchen selbst neu
    quelle.onmessage = (ereignis) => {
      const stand = JSON.parse(ereignis.data);
      kanal?.postMessage(stand);
      anwenden(stand);
    };
  };

  let kanal = null;
  if (!("locks" in navigator) || !("BroadcastChannel" in window)) return direkt(); // ältere Browser: jede Ansicht für sich

  kanal = new BroadcastChannel("broki-live-updates");
  kanal.onmessage = (ereignis) => anwenden(ereignis.data);
  fetch("/api/state").then((a) => a.json()).then(anwenden).catch(() => {}); // Startzustand, bis das erste Update kommt
  // Wer die Sperre bekommt, hält die Verbindung – bis der Tab geschlossen wird; dann übernimmt der nächste.
  navigator.locks.request("broki-live-verbindung", () => new Promise(() => direkt()));
}

export async function sende(pfad, daten = {}, methode = "POST") {
  const antwort = await fetch(pfad, {
    method: methode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(daten),
  });
  if (!antwort.ok) {
    const { fehler } = await antwort.json().catch(() => ({}));
    throw new Error(fehler ?? `Fehler ${antwort.status}`);
  }
  return antwort.json();
}

/** Füllt die Statusanzeige in der Kopfzeile und hält "vor X s" im Sekundentakt aktuell. */
let letzterStatus = null;
export function zeigeStatus(status) {
  letzterStatus = status;
  const mikro = document.querySelector("#mikro");
  if (mikro) {
    mikro.querySelector(".punkt").classList.toggle("an", status.aufnahme);
    mikro.querySelector("span:last-child").textContent = !status.aufnahme ? "Pausiert" : status.quelle === "mikro" ? "Hört zu" : "Läuft (Mock-Skript)";
  }
  const mock = document.querySelector("#mock");
  if (mock) mock.hidden = !status.mock;
  const hinweis = document.querySelector("#hinweis");
  if (hinweis) hinweis.textContent = status.hinweis ?? "";
  tick();
}
function tick() {
  const ziel = document.querySelector("#zyklus");
  if (!ziel || !letzterStatus) return;
  const t = letzterStatus.letzterZyklus;
  ziel.textContent = t ? `Letzter Zyklus vor ${Math.max(0, Math.round((Date.now() - t) / 1000))} s` : "Noch kein Zyklus";
}
setInterval(tick, 1000);

// ── Virtuelle Personen: flache Illustrationen in den Brodos-Farben (frei gezeichnet, keine echten Personen) ──
// "FARBE" wird durch die Farbe des Agenten ersetzt.
const FIGUREN = {
  sales: `<circle cx="32" cy="32" r="32" fill="FARBE"/>
    <path d="M10 64c0-13 9-20 22-20s22 7 22 20z" fill="#fff"/>
    <path d="M32 46l-4 5 4 13 4-13z" fill="#ffd50d"/>
    <path d="M24 44l8 6 8-6v-6H24z" fill="#e9b88f"/>
    <circle cx="32" cy="27" r="12" fill="#f2c9a5"/>
    <path d="M19.5 27c-1-9 4-15 12.5-15S45.5 18 44.5 27c-2-5-5-8-12.5-8s-10.5 3-12.5 8z" fill="#102636"/>`,
  bpm: `<circle cx="32" cy="32" r="32" fill="FARBE"/>
    <path d="M17 26c0-10 6-16 15-16s15 6 15 16v16H17z" fill="#31435e"/>
    <path d="M10 64c0-13 9-20 22-20s22 7 22 20z" fill="#c8d9ee"/>
    <path d="M25 44l7 7 7-7v-6H25z" fill="#c68f62"/>
    <circle cx="32" cy="28" r="11.5" fill="#d9a074"/>
    <path d="M20.5 27c0-8 5-12 11.5-12s11.5 4 11.5 12c-4-1-8-4-10-8-2 4-8 7-13 8z" fill="#31435e"/>
    <g fill="none" stroke="#fff" stroke-width="1.8"><circle cx="27" cy="29.5" r="4"/><circle cx="37" cy="29.5" r="4"/><path d="M31 29.5h2"/></g>`,
  consultant: `<circle cx="32" cy="32" r="32" fill="FARBE"/>
    <path d="M10 64c0-13 9-20 22-20s22 7 22 20z" fill="#c8d9ee"/>
    <path d="M26 44l6 9 6-9z" fill="#fff"/>
    <path d="M25 44l7 6 7-6v-6H25z" fill="#7a4c30"/>
    <circle cx="32" cy="27" r="12" fill="#8d5a3b"/>
    <path d="M20 31c0 8 5 12 12 12s12-4 12-12c-2 3-6 4-12 4s-10-1-12-4z" fill="#102636"/>
    <g fill="#102636"><circle cx="23" cy="19" r="5"/><circle cx="29" cy="15" r="5.5"/><circle cx="36" cy="15" r="5.5"/><circle cx="41.5" cy="19" r="5"/></g>`,
};
let figurNr = 0;

/** Figur eines Spezial-Agenten als SVG (rein dekorativ, der Name steht daneben). Ohne Zeichnung: Kreis mit Anfangsbuchstaben. */
export function figur(agent) {
  const farbe = /^#[0-9a-f]{6}$/i.test(agent?.farbe ?? "") ? agent.farbe : "#0069b4";
  const rahmen = el("span", "figur");
  const zeichnung = FIGUREN[agent?.figur];
  if (zeichnung) {
    const id = `rund-${figurNr++}`;
    rahmen.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><clipPath id="${id}"><circle cx="32" cy="32" r="32"/></clipPath><g clip-path="url(#${id})">${zeichnung.replaceAll("FARBE", farbe)}</g></svg>`;
  } else {
    rahmen.classList.add("kuerzel");
    rahmen.style.background = farbe;
    rahmen.textContent = (agent?.name ?? "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
    rahmen.setAttribute("aria-hidden", "true");
  }
  return rahmen;
}

/** Baut den Chatverlauf mit Figuren und Sprechblasen. Während die Agenten nachdenken, zeigen sie "…". */
let chatStand = "";
export function zeigeChat(ziel, nachrichten, denkt = false) {
  const stand = `${nachrichten.length}/${denkt}/${[...AGENTEN.values()].map((a) => a.name + a.figur + a.farbe)}`;
  if (stand === chatStand) return false;
  chatStand = stand;
  ziel.replaceChildren();
  if (!nachrichten.length) ziel.append(el("p", "leer", "Noch keine Fragen. Die Spezial-Agenten antworten nur, wenn sie gefragt werden."));

  const antwortZeile = (id, name, inhalt) => {
    const agent = AGENTEN.get(id) ?? { name, figur: "kuerzel", farbe: "#31435e" };
    const zeile = el("div", "zeile");
    zeile.style.setProperty("--rolle", agent.farbe);
    const blase = el("div", "blase antwort");
    blase.append(el("div", "rolle", agent.name), inhalt);
    zeile.append(figur(agent), blase);
    return zeile;
  };

  for (const n of nachrichten) {
    if (n.von === "frage") {
      const blase = el("div", "blase frage");
      blase.append(el("div", "rolle", n.an && n.an !== "alle" ? `Frage an ${agentName(n.an)}` : "Frage an alle"), el("div", "", n.text));
      ziel.append(blase);
    } else {
      ziel.append(antwortZeile(n.von, n.name ?? "Agent", el("div", "", n.text)));
    }
  }

  // Wer gerade gefragt ist, "überlegt" sichtbar.
  const letzte = nachrichten.at(-1);
  if (denkt && letzte?.von === "frage") {
    const gefragt = !letzte.an || letzte.an === "alle" ? [...AGENTEN.keys()] : [letzte.an];
    for (const id of gefragt) {
      const punkte = el("div", "punkte");
      punkte.append(el("i"), el("i"), el("i"));
      ziel.append(antwortZeile(id, "Agent", punkte));
    }
  }
  ziel.scrollTop = ziel.scrollHeight;
  return true;
}

/** Füllt eine Auswahl "An alle / Agent …" (für <select>). */
export function fuelleAgentenWahl(select) {
  const vorher = select.value || "alle";
  select.replaceChildren(
    ...[["alle", "An alle"], ...[...AGENTEN.values()].map((a) => [a.id, a.name])].map(([wert, text]) => {
      const o = el("option", "", text);
      o.value = wert;
      return o;
    }),
  );
  select.value = [...select.options].some((o) => o.value === vorher) ? vorher : "alle";
}
