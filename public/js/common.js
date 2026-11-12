// Gemeinsame Helfer für alle drei Ansichten. Kein Build-Schritt, kein Framework.

export const ROLLEN = {
  sales: { name: "Sales Professional", symbol: "◆" },
  bpm: { name: "BPM Specialist", symbol: "■" },
  consultant: { name: "Business Consultant", symbol: "▲" },
};

/** Kleines DOM-Helferlein; Text läuft immer über textContent (kein HTML aus Transkript/LLM). */
export function el(tag, klasse = "", text = "") {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text) e.textContent = text;
  return e;
}

/** Hält die Ansicht live: Server-Sent Events, der Browser verbindet sich nach Abbrüchen selbst neu. */
export function verbinde(beiUpdate) {
  const quelle = new EventSource("/api/events");
  quelle.onmessage = (ereignis) => {
    const stand = JSON.parse(ereignis.data);
    for (const [rolle, { name }] of Object.entries(stand.agenten ?? {})) ROLLEN[rolle].name = name; // Namen aus der Admin-Ansicht
    beiUpdate(stand);
  };
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
    mikro.querySelector("span:last-child").textContent = status.aufnahme ? "Mikro aktiv" : "Pausiert";
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
const FIGUREN = {
  sales: `<circle cx="32" cy="32" r="32" fill="#0069b4"/>
    <path d="M10 64c0-13 9-20 22-20s22 7 22 20z" fill="#fff"/>
    <path d="M32 46l-4 5 4 13 4-13z" fill="#ffd50d"/>
    <path d="M24 44l8 6 8-6v-6H24z" fill="#e9b88f"/>
    <circle cx="32" cy="27" r="12" fill="#f2c9a5"/>
    <path d="M19.5 27c-1-9 4-15 12.5-15S45.5 18 44.5 27c-2-5-5-8-12.5-8s-10.5 3-12.5 8z" fill="#102636"/>`,
  bpm: `<circle cx="32" cy="32" r="32" fill="#004080"/>
    <path d="M17 26c0-10 6-16 15-16s15 6 15 16v16H17z" fill="#31435e"/>
    <path d="M10 64c0-13 9-20 22-20s22 7 22 20z" fill="#c8d9ee"/>
    <path d="M25 44l7 7 7-7v-6H25z" fill="#c68f62"/>
    <circle cx="32" cy="28" r="11.5" fill="#d9a074"/>
    <path d="M20.5 27c0-8 5-12 11.5-12s11.5 4 11.5 12c-4-1-8-4-10-8-2 4-8 7-13 8z" fill="#31435e"/>
    <g fill="none" stroke="#fff" stroke-width="1.8"><circle cx="27" cy="29.5" r="4"/><circle cx="37" cy="29.5" r="4"/><path d="M31 29.5h2"/></g>`,
  consultant: `<circle cx="32" cy="32" r="32" fill="#31435e"/>
    <path d="M10 64c0-13 9-20 22-20s22 7 22 20z" fill="#0069b4"/>
    <path d="M26 44l6 9 6-9z" fill="#fff"/>
    <path d="M25 44l7 6 7-6v-6H25z" fill="#7a4c30"/>
    <circle cx="32" cy="27" r="12" fill="#8d5a3b"/>
    <path d="M20 31c0 8 5 12 12 12s12-4 12-12c-2 3-6 4-12 4s-10-1-12-4z" fill="#102636"/>
    <g fill="#102636"><circle cx="23" cy="19" r="5"/><circle cx="29" cy="15" r="5.5"/><circle cx="36" cy="15" r="5.5"/><circle cx="41.5" cy="19" r="5"/></g>`,
};

/** Liefert die Figur eines Spezial-Agenten als SVG-Element (rein dekorativ, der Name steht daneben). */
export function figur(rolle) {
  const rahmen = el("span", "figur");
  rahmen.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><clipPath id="rund-${rolle}"><circle cx="32" cy="32" r="32"/></clipPath><g clip-path="url(#rund-${rolle})">${FIGUREN[rolle]}</g></svg>`;
  return rahmen;
}

/** Baut den Chatverlauf mit Figuren und Sprechblasen. Während die Agenten nachdenken, zeigen sie "…". */
let chatStand = "";
export function zeigeChat(ziel, nachrichten, denkt = false) {
  const stand = `${nachrichten.length}/${denkt}/${Object.values(ROLLEN).map((r) => r.name)}`;
  if (stand === chatStand) return false;
  chatStand = stand;
  ziel.replaceChildren();
  if (!nachrichten.length) ziel.append(el("p", "leer", "Noch keine Fragen. Die Spezial-Agenten antworten nur, wenn sie gefragt werden."));

  const antwortZeile = (rolle, inhalt) => {
    const zeile = el("div", `zeile ${rolle}`);
    const blase = el("div", "blase antwort");
    blase.append(el("div", "rolle", ROLLEN[rolle].name), inhalt);
    zeile.append(figur(rolle), blase);
    return zeile;
  };

  for (const n of nachrichten) {
    if (n.von === "frage") {
      const blase = el("div", "blase frage");
      blase.append(el("div", "rolle", n.an && n.an !== "alle" ? `Frage an ${ROLLEN[n.an].name}` : "Frage an alle"), el("div", "", n.text));
      ziel.append(blase);
    } else {
      ziel.append(antwortZeile(n.von, el("div", "", n.text)));
    }
  }

  // Wer gerade gefragt ist, "überlegt" sichtbar.
  const letzte = nachrichten.at(-1);
  if (denkt && letzte?.von === "frage") {
    const gefragt = !letzte.an || letzte.an === "alle" ? Object.keys(ROLLEN) : [letzte.an];
    for (const rolle of gefragt) {
      const punkte = el("div", "punkte");
      punkte.append(el("i"), el("i"), el("i"));
      ziel.append(antwortZeile(rolle, punkte));
    }
  }
  ziel.scrollTop = ziel.scrollHeight;
  return true;
}
