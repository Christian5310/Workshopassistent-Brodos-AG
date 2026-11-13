// Übersicht: der erste Bereich nach dem Eintreten. Links wählt man, womit man arbeiten will;
// im Hauptfenster legt man dann etwas Neues an oder öffnet etwas Bestehendes.
import { AGENTEN, el, gehe, icon, imRahmen, sende, verbinde } from "./common.js";

imRahmen("uebersicht");
const $ = (id) => document.querySelector(id);
const melde = (text) => ($("#meldung").textContent = text);

const BEREICHE = {
  meeting: { name: "KI Transkriptionsassistent", icon: "mic", text: "Hört im Meeting mit, schreibt das Transkript und führt die To-do-Liste.", unterzeile: "Lege ein neues Meeting an oder öffne ein bestehendes." },
  agenten: { name: "KI Wissensagenten", icon: "users", text: "Experten für Vertrieb, Prozesse und Strategie. Antworten auf Frage, per Sprache oder Text.", unterzeile: "Lege einen neuen Agenten an oder öffne einen bestehenden." },
};
let bereich = null;
try { bereich = sessionStorage.getItem("broki-uebersicht"); } catch {}
if (!(bereich in BEREICHE)) bereich = null;

function waehle(neu) {
  bereich = neu;
  try { neu ? sessionStorage.setItem("broki-uebersicht", neu) : sessionStorage.removeItem("broki-uebersicht"); } catch {}
  melde("");
  zeigeBereich();
}

function zeigeBereich() {
  // Auswahl links
  $("#wahl").replaceChildren(
    ...Object.entries(BEREICHE).map(([id, b]) => {
      const k = el("button", `select-item${id === bereich ? " is-active" : ""}`);
      k.type = "button";
      k.setAttribute("aria-pressed", String(id === bereich));
      k.append(icon(b.icon), el("span", "", b.name));
      k.addEventListener("click", () => waehle(id));
      return k;
    }),
  );
  $("#titel").textContent = bereich ? BEREICHE[bereich].name : "Übersicht";
  $("#unterzeile").textContent = bereich ? BEREICHE[bereich].unterzeile : "Womit möchtest du arbeiten? Wähle links oder hier einen Bereich.";
  $("#b-start").hidden = bereich !== null;
  $("#b-meeting").hidden = bereich !== "meeting";
  $("#b-agenten").hidden = bereich !== "agenten";
  richteAus();
}

// Startzustand: dieselbe Auswahl noch einmal als Kacheln im Hauptfenster
$("#b-start").replaceChildren(
  ...Object.entries(BEREICHE).map(([id, b]) => {
    const k = el("button", "kachel");
    k.type = "button";
    const kreis = el("span", "kreis");
    kreis.append(icon(b.icon));
    k.append(kreis, el("span", "kachel-titel", b.name), el("span", "kachel-text", b.text));
    k.addEventListener("click", () => waehle(id));
    return k;
  }),
);

const beschrifte = (id, iconName, text) => $(id).replaceChildren(icon(iconName), text);
const option = (wert, text) => { const o = el("option", "", text); o.value = wert; return o; };
const datum = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("de-DE");

// ── Meetings ──
let stand = null;
let meetingKennung = "";
async function ladeMeetings() {
  const meetings = await (await fetch("/api/tage")).json();
  const offenId = stand?.tag?.id ?? "";
  const kennung = JSON.stringify([meetings.map((m) => [m.id, m.name, m.datum, m.abgeschlossen]), offenId]);
  if (kennung === meetingKennung) return;
  meetingKennung = kennung;
  const wahl = $("#m-wahl");
  const vorher = wahl.value;
  const gruppe = (titel, liste) => {
    const g = el("optgroup");
    g.label = titel;
    g.append(...liste.map((m) => option(m.id, `${m.name} · ${datum(m.datum)}${m.id === offenId ? " (geöffnet)" : ""}`)));
    return g;
  };
  const offene = meetings.filter((m) => !m.abgeschlossen);
  const fertige = meetings.filter((m) => m.abgeschlossen);
  wahl.replaceChildren(option("", meetings.length ? "Bitte wählen …" : "Noch kein Meeting angelegt"));
  if (offene.length) wahl.append(gruppe("Offene Meetings", offene));
  if (fertige.length) wahl.append(gruppe("Abgeschlossen (wieder öffnen)", fertige));
  wahl.value = [...wahl.options].some((o) => o.value === vorher) && vorher ? vorher : offenId;
  zeigeMeetingKnopf();
}
function zeigeMeetingKnopf() {
  const id = $("#m-wahl").value;
  const offenId = stand?.tag?.id ?? "";
  const laeuft = stand?.status.aufnahme && id && id !== offenId;
  $("#m-oeffnen").disabled = !id || laeuft;
  beschrifte("#m-oeffnen", "pfeil", id && id === offenId ? "Weiter mit diesem Meeting" : "Meeting öffnen");
  $("#m-info").textContent = laeuft ? "In einem anderen Meeting läuft gerade die Aufnahme. Bitte dort erst pausieren." : "";
}
$("#m-wahl").addEventListener("change", zeigeMeetingKnopf);

async function oeffneMeeting(id) {
  if (id !== (stand?.tag?.id ?? "")) await sende(`/api/tage/${id}/aktivieren`);
  gehe("assistent");
}
$("#m-oeffnen-formular").addEventListener("submit", (e) => {
  e.preventDefault();
  oeffneMeeting($("#m-wahl").value).catch((f) => melde(f.message));
});

const zeigeMeetingFelder = (an) => {
  $("#m-felder").hidden = !an;
  $("#m-neu").hidden = an;
  if (an) {
    if (!$("#m-datum").value) $("#m-datum").value = new Date().toLocaleDateString("sv-SE");
    $("#m-name").focus();
  }
};
$("#m-neu").addEventListener("click", () => zeigeMeetingFelder(true));
$("#m-abbrechen").addEventListener("click", () => zeigeMeetingFelder(false));
$("#m-formular").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    if (stand?.status.aufnahme) throw new Error("In einem Meeting läuft gerade die Aufnahme. Bitte dort erst pausieren.");
    const agenda = $("#m-agenda").value.split("\n").map((z) => z.trim()).filter(Boolean);
    const { id } = await sende("/api/tage", { name: $("#m-name").value, datum: $("#m-datum").value, agenda });
    $("#m-formular").reset();
    zeigeMeetingFelder(false);
    await oeffneMeeting(id);
  } catch (fehler) {
    melde(fehler.message);
  }
});

// ── Agenten ──
let agentKennung = "";
function ladeAgenten() {
  const kennung = JSON.stringify([...AGENTEN.values()]);
  if (kennung === agentKennung) return;
  agentKennung = kennung;
  const wahl = $("#a-wahl");
  const vorher = wahl.value || "alle";
  wahl.replaceChildren(option("alle", "Alle Agenten"), ...[...AGENTEN.values()].map((a) => option(a.id, a.name)));
  wahl.value = [...wahl.options].some((o) => o.value === vorher) ? vorher : "alle";
}
function oeffneAgent(id) {
  try { sessionStorage.setItem("broki-agent", id); } catch {}
  gehe("agenten");
}
$("#a-oeffnen-formular").addEventListener("submit", (e) => {
  e.preventDefault();
  oeffneAgent($("#a-wahl").value);
});

const zeigeAgentFelder = (an) => {
  $("#a-felder").hidden = !an;
  $("#a-neu").hidden = an;
  if (an) $("#a-name").focus();
};
const zaehle = () => ($("#a-zaehler").textContent = $("#a-wissen").value.length ? `${$("#a-wissen").value.length.toLocaleString("de-DE")} Zeichen` : "leer");
$("#a-wissen").addEventListener("input", zaehle);
$("#a-neu").addEventListener("click", () => zeigeAgentFelder(true));
$("#a-abbrechen").addEventListener("click", () => zeigeAgentFelder(false));
$("#a-laden").addEventListener("click", () => $("#a-datei").click());
$("#a-datei").addEventListener("change", async () => {
  const texte = await Promise.all([...$("#a-datei").files].map((f) => f.text()));
  const neu = [$("#a-wissen").value.trim(), ...texte.map((t) => t.trim())].filter(Boolean).join("\n\n");
  if (neu.length > 300000) return void melde("Die Wissensdatei ist zu groß (höchstens 300.000 Zeichen).");
  $("#a-wissen").value = neu;
  $("#a-datei").value = "";
  zaehle();
});
$("#a-formular").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    const farben = ["#0069b4", "#004080", "#31435e"];
    const { id } = await sende("/api/agenten", { name: $("#a-name").value, beschreibung: $("#a-prompt").value, wissen: $("#a-wissen").value, figur: $("#a-symbol").value, farbe: farben[AGENTEN.size % farben.length] });
    $("#a-formular").reset();
    zaehle();
    zeigeAgentFelder(false);
    oeffneAgent(id);
  } catch (fehler) {
    melde(fehler.message);
  }
});

beschrifte("#m-neu", "plus", "Neues Meeting anlegen");
beschrifte("#m-anlegen", "plus", "Anlegen und öffnen");
beschrifte("#m-abbrechen", "x", "Abbrechen");
beschrifte("#a-neu", "plus", "Neuen Agenten anlegen");
beschrifte("#a-anlegen", "plus", "Anlegen und öffnen");
beschrifte("#a-abbrechen", "x", "Abbrechen");
beschrifte("#a-laden", "plus", "Datei laden (.md)");
beschrifte("#a-oeffnen", "pfeil", "Agent öffnen");

/** Richtet das erste Auswahlfeld links an der Oberkante des ersten Kastens im Hauptfenster aus. */
function richteAus() {
  const wahl = $("#wahl");
  wahl.style.marginTop = "";
  const ziel = [...document.querySelectorAll("#b-start, #b-meeting, #b-agenten")].find((e) => !e.hidden);
  if (!ziel || matchMedia("(max-width: 900px)").matches) return;
  const versatz = ziel.getBoundingClientRect().top - wahl.getBoundingClientRect().top;
  if (versatz > 0) wahl.style.marginTop = `${versatz}px`;
}
addEventListener("resize", richteAus);
document.fonts?.ready.then(richteAus);

zeigeBereich();
verbinde((daten) => {
  stand = daten;
  ladeMeetings();
  ladeAgenten();
  zeigeMeetingKnopf();
});
