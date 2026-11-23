// Pinnwand: je angepinntem Material ("Pin" in der Material-Liste) eine Notiz mit Überschrift und Kurzfassung.
// Ein Klick öffnet die Notiz groß im eigenen Browserfenster (public/pin.html): erweiterte Zusammenfassung,
// Original öffnen, Merlin zu diesem Material fragen. Namen ("Von wem") erscheinen hier bewusst nicht (Beamer).
import { el, gehe, icon, imRahmen, sende, verbinde, zeigeAbhalten } from "./common.js";

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
    leer.replaceChildren(el("p", "", "Noch nichts angepinnt. Hake beim Material „Pin“ an, lade eine HTML-Seite hoch oder schreibe oben rechts eine eigene Notiz."), hin);
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
  // HTML-Seiten öffnen sich direkt (gesichert über die Sandbox des Servers), alles andere als Notiz mit Zusammenfassung
  const adresse = k.format === "HTML" ? k.link : `/pin.html?ws=${encodeURIComponent(workshopId)}&m=${encodeURIComponent(k.id)}`;
  const breite = Math.min(1100, screen.availWidth - 80);
  const hoehe = Math.min(900, screen.availHeight - 80);
  const fenster = window.open(adresse, `pin-${k.id}`, `popup,width=${breite},height=${hoehe},left=${Math.max(0, (screen.availWidth - breite) / 2)},top=40`);
  fenster?.focus();
}

// ── Eigene Notiz schreiben (Titel und Text, erscheint sofort auf der Pinnwand) ──
const dialog = $("#notiz-dialog");
$("#notiz-neu").append(icon("plus"), "Notiz hinzufügen");
const zaehle = () => ($("#notiz-zaehler").textContent = $("#notiz-text").value.length ? `${$("#notiz-text").value.length.toLocaleString("de-DE")} Zeichen` : "leer");
$("#notiz-text").addEventListener("input", zaehle);
$("#notiz-neu").addEventListener("click", () => {
  $("#notiz-meldung").textContent = "";
  dialog.showModal();
  $("#notiz-titel").focus();
});
$("#notiz-abbrechen").addEventListener("click", () => dialog.close());
$("#notiz-formular").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!workshopId) return;
  $("#notiz-speichern").disabled = true;
  try {
    await sende(`/api/workshops/${workshopId}/notiz`, { titel: $("#notiz-titel").value, text: $("#notiz-text").value });
    $("#notiz-titel").value = $("#notiz-text").value = "";
    zaehle();
    dialog.close();
    await lade();
  } catch (fehler) {
    $("#notiz-meldung").textContent = fehler.message;
  } finally {
    $("#notiz-speichern").disabled = false;
  }
});

verbinde((daten) => {
  $("#ws-name").textContent = daten.workshop?.name ?? "Kein Workshop geöffnet";
  $("#abhalten").hidden = !daten.tag;
  $("#notiz-neu").hidden = !daten.workshop;
  if (daten.tag) zeigeAbhalten($("#abhalten"), "pinnwand", daten);
  const neu = daten.workshop?.id ?? null;
  if (neu !== workshopId) {
    workshopId = neu;
    karten = [];
    if (workshopId) lade();
    else zeige();
  }
});
