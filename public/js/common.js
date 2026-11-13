// Gemeinsame Helfer für den App-Rahmen und alle Ansichten. Kein Build-Schritt, kein Framework.

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

// ── Linien-Icons im Stil von Lucide (lucide.dev, ISC-Lizenz), lokal eingebettet ──
const ICONS = {
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  text: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  liste: '<path d="m3 17 2 2 4-4"/><path d="m3 7 2 2 4-4"/><path d="M13 6h8"/><path d="M13 12h8"/><path d="M13 18h8"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  archive: '<rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/>',
  regler: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  kalender: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  vollbild: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  senden: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  kreis: '<circle cx="12" cy="12" r="9"/>',
  laeuft: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  erledigt: '<circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/>',
  pfeil: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  frage: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  runter: '<path d="m6 9 6 6 6-6"/>',
  ablage: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z"/>',
  kopieren: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  // Icons für Spezial-Agenten
  sales: '<rect width="20" height="14" x="2" y="7" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  bpm: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
  consultant: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>',
  kuerzel: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
};

/** Liefert ein Linien-Icon als SVG-Element (rein dekorativ; der Text steht immer daneben oder im Titel). */
export function icon(name) {
  const rahmen = document.createElement("span");
  rahmen.innerHTML = `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ICONS.kreis}</svg>`;
  return rahmen.firstElementChild;
}

/** Knopf mit Icon und Text. */
export function knopf(text, iconName, klasse = "") {
  const k = el("button", klasse);
  k.type = "button";
  if (iconName) k.append(icon(iconName));
  k.append(text);
  return k;
}

// ── App-Rahmen: Die Ansichten laufen in einem Fenster des Rahmens (app.html), der das Mikrofon hält. ──
const rahmen = window.parent !== window ? window.parent : null;

/** Ansichten gehören in den Rahmen. Wird eine direkt aufgerufen, leitet sie dorthin um. */
export function imRahmen(bereich) {
  if (!rahmen) location.replace(`/app#${bereich}`);
  else if (rahmen.document.documentElement.classList.contains("praesentation")) document.documentElement.classList.add("praesentation");
}

/** Wechselt im Rahmen den Bereich (z. B. "archiv"), ohne die Aufnahme zu unterbrechen. */
export function gehe(bereich) {
  if (rahmen) rahmen.location.hash = bereich;
  else location.href = `/app#${bereich}`;
}

/** Die Aufnahme-Steuerung des Rahmens (starten, pausieren). */
export const merlin = () => rahmen?.merlin;

/**
 * Hält die Ansicht live über Server-Sent Events.
 * Browser erlauben nur etwa sechs gleichzeitige Verbindungen pro Adresse. Deshalb hält immer nur EIN Dokument
 * (in der Regel der Rahmen) die Verbindung zum Server und gibt die Updates über einen BroadcastChannel weiter.
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
  // Wer die Sperre bekommt, hält die Verbindung – bis das Dokument geschlossen wird; dann übernimmt das nächste.
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

// ── Spezial-Agenten: Kreis mit Initialen in einer Farbe der Palette ──
const PALETTE = ["#0069b4", "#004080", "#31435e"];
export const agentFarbe = (agent) => (PALETTE.includes(agent?.farbe) ? agent.farbe : PALETTE[0]);

export function avatar(agent, klasse = "") {
  const kreis = el("span", `avatar ${klasse}`.trim(), (agent?.name ?? "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase());
  kreis.style.setProperty("--agent", agentFarbe(agent));
  kreis.setAttribute("aria-hidden", "true");
  return kreis;
}

/** Baut den Chatverlauf. Während die Agenten nachdenken, zeigen die gefragten drei Punkte. */
let chatStand = "";
export function zeigeChat(ziel, nachrichten, denkt = false) {
  const stand = `${nachrichten.length}/${denkt}/${[...AGENTEN.values()].map((a) => a.name + a.farbe)}`;
  if (stand === chatStand) return false;
  chatStand = stand;
  ziel.replaceChildren();
  if (!nachrichten.length) ziel.append(el("p", "leer", "Noch keine Fragen. Die Spezial-Agenten antworten nur, wenn sie gefragt werden."));

  const antwortZeile = (id, name, inhalt) => {
    const agent = AGENTEN.get(id) ?? { name, farbe: "#31435e" };
    const zeile = el("div", "zeile");
    zeile.style.setProperty("--agent", agentFarbe(agent));
    const blase = el("div", "blase antwort");
    blase.append(el("div", "rolle", agent.name), inhalt);
    zeile.append(avatar(agent), blase);
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
