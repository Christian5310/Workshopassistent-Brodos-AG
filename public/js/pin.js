// Großes Fenster zu einer Pinnwand-Notiz (eigenes Browserfenster, nicht im App-Rahmen):
// Kurzfassung, erweiterte Zusammenfassung, Original öffnen und Fragen an Merlin zu genau diesem Material.
import { el, icon, sende } from "./common.js";

const $ = (s) => document.querySelector(s);
const parameter = new URLSearchParams(location.search);
const workshopId = parameter.get("ws");
const materialId = parameter.get("m");
let nachladen = null;

$("#pin-zu").append(icon("x"), "Schließen");
$("#pin-zu").addEventListener("click", () => window.close());
$("#pin-mikro").append(icon("mic"));
$("#pin-original").append(icon("text"), "Original öffnen");
$("#pin-bearbeiten").append(icon("text"), "Bearbeiten");
$("#pin-loeschen").append(icon("trash"), "Löschen");
let notiz = null; // die gerade angezeigte eigene Notiz (oder null)

async function lade() {
  clearTimeout(nachladen);
  try {
    const antwort = await fetch(`/api/workshops/${encodeURIComponent(workshopId)}/pinnwand`);
    if (!antwort.ok) throw new Error();
    const k = (await antwort.json()).karten.find((x) => x.id === materialId);
    if (!k) {
      $("#pin-titel").textContent = "Diese Notiz hängt nicht mehr an der Pinnwand.";
      $("#pin-kurz").textContent = "";
      $("#pin-lang").replaceChildren();
      return;
    }
    document.title = `${k.titel} · Pin`;
    $("#pin-titel").textContent = k.titel;
    $("#pin-format").textContent = k.format;
    $("#pin-format").className = `pw-format format-${k.format.toLowerCase()}`;
    $("#pin-original").href = k.link;
    $("#pin-original").hidden = !!k.notiz;
    notiz = k.notiz ? k : null;
    $("#pin-bearbeiten").hidden = $("#pin-loeschen").hidden = !k.notiz;
    $("#pin-edit").hidden = $("#pin-edit").hidden || !k.notiz;
    $("#pin-kurz").textContent = k.kurz || "Merlin fasst das Material zusammen …";
    if (k.wartet) {
      $("#pin-lang").replaceChildren(el("p", "pin-wartet", "Merlin schreibt die erweiterte Zusammenfassung …"));
      nachladen = setTimeout(lade, 3000);
    } else zeigeLang(k.lang);
  } catch {
    $("#pin-lang").replaceChildren(el("p", "pin-wartet", "Die Notiz ließ sich gerade nicht laden. Ich versuche es gleich noch einmal."));
    nachladen = setTimeout(lade, 5000);
  }
}

/** Erweiterte Zusammenfassung: "## " = Zwischenüberschrift, "- " = Stichpunkt, sonst Absatz (nur Text, kein HTML). */
function zeigeLang(text) {
  const teile = [];
  let liste = null;
  for (const roh of text.split(/\r?\n/)) {
    const zeile = roh.replace(/\*\*/g, "").trim();
    if (!zeile) { liste = null; continue; }
    const titel = zeile.match(/^#{1,4}\s+(.*)$/);
    const punkt = zeile.match(/^[-•*]\s+(.*)$/);
    if (titel) { liste = null; teile.push(el("h3", "", titel[1])); }
    else if (punkt) {
      if (!liste) { liste = el("ul"); teile.push(liste); }
      liste.append(el("li", "", punkt[1]));
    } else { liste = null; teile.push(el("p", "", zeile)); }
  }
  $("#pin-lang").replaceChildren(...teile);
}

// ── Eigene Notiz bearbeiten oder löschen ──
const ws = encodeURIComponent(workshopId ?? "");
$("#pin-bearbeiten").addEventListener("click", () => {
  if (!notiz) return;
  clearTimeout(nachladen);
  $("#pin-edit-titel").value = notiz.titel;
  $("#pin-edit-text").value = notiz.lang;
  $("#pin-edit-meldung").textContent = "";
  $("#pin-edit").hidden = false;
  $("#pin-edit-titel").focus();
});
$("#pin-edit-abbruch").addEventListener("click", () => { $("#pin-edit").hidden = true; });
$("#pin-edit").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await sende(`/api/workshops/${ws}/notiz/${encodeURIComponent(materialId)}`, { titel: $("#pin-edit-titel").value, text: $("#pin-edit-text").value }, "PATCH");
    $("#pin-edit").hidden = true;
    await lade();
  } catch (fehler) {
    $("#pin-edit-meldung").textContent = fehler.message;
  }
});
$("#pin-loeschen").addEventListener("click", async () => {
  if (!notiz || !confirm(`Die Notiz „${notiz.titel}“ wirklich löschen?`)) return;
  try {
    await sende(`/api/workshops/${ws}/material/${encodeURIComponent(materialId)}`, {}, "DELETE");
    window.close();
  } catch (fehler) {
    $("#pin-edit-meldung").textContent = fehler.message;
    $("#pin-edit").hidden = false;
  }
});

// ── Merlin zu genau diesem Material fragen; der Verlauf sammelt sich darunter ──
$("#pin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const frage = $("#pin-feld").value.trim();
  if (!frage) return;
  $("#pin-feld").value = "";
  const eintrag = el("li");
  const antwort = el("p", "pin-antwort pin-wartet", "Merlin liest nach …");
  eintrag.append(el("p", "pin-frage-text", frage), antwort);
  $("#pin-verlauf").prepend(eintrag);
  $("#pin-senden").disabled = true;
  try {
    const r = await sende(`/api/workshops/${encodeURIComponent(workshopId)}/material/${encodeURIComponent(materialId)}/frage`, { frage });
    antwort.textContent = r.antwort;
  } catch (fehler) {
    antwort.textContent = fehler.message;
  } finally {
    antwort.classList.remove("pin-wartet");
    $("#pin-senden").disabled = false;
    $("#pin-feld").focus();
  }
});

// ── Frage sprechen: solange zugehört wird, ist die laufende Aufnahme stumm (die Frage soll nicht ins Protokoll) ──
let rekorder = null;
const laufendeAufnahme = () => { try { return window.opener?.parent?.merlin?.aufnahme ?? null; } catch { return null; } };
const stumm = (an) => { const a = laufendeAufnahme(); if (a) a.stumm = an; };
function zeigeMikro(an) {
  $("#pin-mikro").classList.toggle("hoert", an);
  $("#pin-mikro").setAttribute("aria-pressed", String(an));
}
async function hoerStart() {
  if (rekorder) return void (rekorder.state === "recording" && rekorder.stop());
  try {
    const strom = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    const teile = [];
    const r = new MediaRecorder(strom, { audioBitsPerSecond: 32000 });
    rekorder = r;
    r.addEventListener("dataavailable", (e) => e.data.size && teile.push(e.data));
    r.addEventListener("stop", async () => {
      strom.getTracks().forEach((t) => t.stop());
      stumm(false);
      rekorder = null;
      zeigeMikro(false);
      $("#pin-feld").placeholder = "Einen Moment …";
      try {
        const blob = new Blob(teile, { type: r.mimeType || "audio/webm" });
        const antwort = await fetch("/api/transkription", { method: "POST", headers: { "Content-Type": blob.type.split(";")[0] }, body: blob });
        const e = await antwort.json();
        if (!antwort.ok) throw new Error(e.fehler ?? `Fehler ${antwort.status}`);
        $("#pin-feld").value = e.text;
        if (e.text) $("#pin-form").requestSubmit();
      } catch (fehler) {
        $("#pin-feld").placeholder = fehler.message;
        return;
      }
      $("#pin-feld").placeholder = "z. B. Welche Zahlen nennt das Material?";
    });
    stumm(true);
    r.start();
    zeigeMikro(true);
  } catch (fehler) {
    $("#pin-feld").placeholder = fehler.name === "NotAllowedError" ? "Mikrofon nicht erlaubt: bitte im Browser zulassen oder tippen." : "Mikrofon lässt sich nicht öffnen: bitte tippen.";
  }
}
$("#pin-mikro").addEventListener("click", hoerStart);
// Fenster zu, während noch zugehört wird: Aufnahme nicht stumm lassen
window.addEventListener("pagehide", () => { if (rekorder) stumm(false); });

if (workshopId && materialId) lade();
else $("#pin-titel").textContent = "Keine Notiz gewählt.";
