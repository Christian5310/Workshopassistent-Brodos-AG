// Pinnwand: je angepinntem Material ("Pin" in der Material-Liste) eine Notiz mit Überschrift und Kurzfassung.
// Ein Klick öffnet die Notiz groß im eigenen Browserfenster (public/pin.html): erweiterte Zusammenfassung,
// Original öffnen, Merlin zu diesem Material fragen. Namen ("Von wem") erscheinen hier bewusst nicht (Beamer).
import { el, gehe, icon, imRahmen, verbinde, zeigeAbhalten } from "./common.js";

imRahmen("pinnwand");
const $ = (s) => document.querySelector(s);

let workshopId = null;
let karten = [];
let nachladen = null;

async function lade() {
  clearTimeout(nachladen);
  if (!workshopId) return;
  try {
    const antwort = await fetch(`/api/workshops/${workshopId}/pinnwand`);
    if (!antwort.ok) throw new Error();
    karten = (await antwort.json()).karten;
    zeige();
  } catch {
    $("#unterzeile").textContent = "Die Pinnwand ließ sich gerade nicht laden. Ich versuche es gleich noch einmal.";
  }
  // Solange Merlin noch Notizen schreibt, öfter nachsehen; sonst ab und zu (neu angepinnt)
  nachladen = setTimeout(lade, karten.some((k) => k.wartet) ? 3000 : 15000);
}

const zumMaterial = () => {
  try { sessionStorage.setItem("broki-ws", workshopId); sessionStorage.setItem("broki-ws-bereich", "material"); sessionStorage.setItem("broki-ws-direkt", "1"); } catch {}
  gehe("workshop");
};

function zeige() {
  const wartend = karten.filter((k) => k.wartet).length;
  $("#unterzeile").textContent = !workshopId || !karten.length
    ? ""
    : `${karten.length} Notiz${karten.length === 1 ? "" : "en"}${wartend ? ` · Merlin fasst noch ${wartend} zusammen …` : ""} · Klick öffnet die Notiz groß`;

  const leer = $("#leer");
  leer.hidden = !!karten.length;
  if (!workshopId) leer.replaceChildren(el("p", "", "Die Pinnwand gehört zu einem Workshop. Öffne zuerst einen Workshop."));
  else if (!karten.length) {
    const hin = el("button", "zweit");
    hin.type = "button";
    hin.append(icon("text"), "Zum Material");
    hin.addEventListener("click", zumMaterial);
    leer.replaceChildren(el("p", "", "Noch nichts angepinnt. Hake beim Material „Pin“ an, dann erscheint es hier als Notiz."), hin);
  }
  $("#wand").replaceChildren(...[...karten].sort((a, b) => a.zeit - b.zeit).map(notiz));
}

function notiz(k, i) {
  const b = el("button", `pw-karte${k.wartet ? " wartet" : ""}`);
  b.type = "button";
  b.style.setProperty("--neigung", `${[-0.6, 0.4, -0.2, 0.7][i % 4]}deg`);
  b.title = `„${k.titel}“ groß öffnen`;
  const format = el("span", `pw-format format-${k.format.toLowerCase()}`, k.format);
  b.append(el("span", "pw-nadel"), format, el("h3", "", k.titel), el("p", "pw-kurz", k.wartet && !k.kurz ? "Merlin fasst das Material zusammen …" : k.kurz));
  b.addEventListener("click", () => oeffne(k));
  return b;
}

/** Eigenes, großes Browserfenster: lässt sich auf den zweiten Bildschirm schieben, die App läuft weiter. */
function oeffne(k) {
  const breite = Math.min(1100, screen.availWidth - 80);
  const hoehe = Math.min(900, screen.availHeight - 80);
  const fenster = window.open(`/pin.html?ws=${encodeURIComponent(workshopId)}&m=${encodeURIComponent(k.id)}`, `pin-${k.id}`, `popup,width=${breite},height=${hoehe},left=${Math.max(0, (screen.availWidth - breite) / 2)},top=40`);
  fenster?.focus();
}

verbinde((daten) => {
  $("#ws-name").textContent = daten.workshop?.name ?? "Kein Workshop geöffnet";
  $("#abhalten").hidden = !daten.tag;
  if (daten.tag) zeigeAbhalten($("#abhalten"), "pinnwand", daten);
  const neu = daten.workshop?.id ?? null;
  if (neu !== workshopId) {
    workshopId = neu;
    karten = [];
    if (workshopId) lade();
    else zeige();
  }
});
