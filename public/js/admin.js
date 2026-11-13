import { el, figur, sende } from "./common.js";

const $ = (id) => document.querySelector(id);
const hole = async (pfad) => (await fetch(pfad)).json();
const datumKurz = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("de-DE");
const heute = () => new Date().toLocaleDateString("sv-SE");

// ── Bausteine für die aufklappbaren Einträge ──
function feld(beschriftung, eingabe, hilfe = "") {
  const rahmen = el("div", "feld");
  const label = el("label", "", beschriftung);
  eingabe.id ||= `f-${Math.random().toString(36).slice(2, 9)}`;
  label.htmlFor = eingabe.id;
  rahmen.append(label);
  if (hilfe) rahmen.append(el("p", "", hilfe));
  rahmen.append(eingabe);
  return rahmen;
}
function eingabe(typ, wert, attribute = {}) {
  const e = el(typ === "textarea" ? "textarea" : "input");
  if (typ !== "textarea") e.type = typ;
  e.value = wert;
  Object.assign(e, attribute);
  return e;
}
/** Aufklappbarer Eintrag mit Titel, Zusatzinfo und Inhalt. */
function eintrag({ titel, info, vorne, offen }) {
  const d = el("details", "eintrag");
  d.open = offen;
  const kopf = el("summary");
  if (vorne) kopf.append(vorne);
  kopf.append(el("span", "titel", titel), el("span", "info", info));
  const inhalt = el("div", "eintrag-inhalt");
  d.append(kopf, inhalt);
  return { d, inhalt };
}
function aktionen(speichern, loeschen) {
  const reihe = el("div", "reihe");
  const meldung = el("span", "meldung");
  meldung.setAttribute("role", "status");
  const s = el("button", "", "Speichern");
  s.type = "button";
  s.addEventListener("click", async () => {
    try {
      meldung.textContent = "Speichert …";
      await speichern();
    } catch (fehler) {
      meldung.textContent = fehler.message;
    }
  });
  reihe.append(s);
  if (loeschen) {
    const l = el("button", "zweit", "Löschen");
    l.type = "button";
    l.addEventListener("click", () => loeschen().catch((f) => (meldung.textContent = f.message)));
    reihe.append(l);
  }
  reihe.append(meldung);
  return reihe;
}

// ── Meetings ──
let offenesMeeting = null; // ID des aufgeklappten Meetings bzw. "neu"
let gespeichert = null; // ID, bei der kurz "Gespeichert" stehen soll

async function zeigeMeetings() {
  const meetings = await hole("/api/tage");
  const liste = $("#meeting-liste");
  liste.replaceChildren();
  const alle = offenesMeeting === "neu" ? [{ id: "neu", name: "", datum: heute(), agenda: [], briefing: "", begriffe: "Brodos, Broki, Merlin", neu: true }, ...meetings] : meetings;

  for (const m of alle) {
    const { d, inhalt } = eintrag({
      titel: m.neu ? "Neues Meeting" : m.name,
      info: m.neu ? "noch nicht gespeichert" : `${datumKurz(m.datum)}${m.aktiv ? " · geöffnet" : m.abgeschlossen ? " · abgeschlossen" : ""} · ${m.agenda.length} Agendapunkte`,
      offen: offenesMeeting === m.id,
    });
    d.addEventListener("toggle", () => { if (d.open) offenesMeeting = m.id; else if (offenesMeeting === m.id) offenesMeeting = null; });

    const name = eingabe("text", m.name, { maxLength: 80, placeholder: "z. B. Sales Agentic Workshop" });
    const datum = eingabe("date", m.datum);
    const agenda = eingabe("textarea", m.agenda.join("\n"), { rows: 6 });
    const briefing = eingabe("textarea", m.briefing, { rows: 6, placeholder: "Noch kein Hintergrundwissen hinterlegt." });
    const begriffe = eingabe("textarea", m.begriffe, { rows: 2 });
    const kopfzeile = el("div", "zweispaltig");
    kopfzeile.append(feld("Name", name), feld("Datum", datum));

    const daten = () => ({ name: name.value, datum: datum.value, agenda: agenda.value.split("\n").map((z) => z.trim()).filter(Boolean), briefing: briefing.value, begriffe: begriffe.value });
    const speichern = async () => {
      const id = m.neu ? (await sende("/api/tage", daten())).id : (await sende(`/api/tage/${m.id}`, daten(), "PUT"), m.id);
      offenesMeeting = gespeichert = id;
      await zeigeMeetings();
    };
    const loeschen = m.neu
      ? async () => { offenesMeeting = null; await zeigeMeetings(); }
      : async () => {
          if (!confirm(`„${m.name}" mit Transkript, To-dos und Fragen wirklich unwiderruflich löschen?`)) return;
          await sende(`/api/tage/${m.id}`, {}, "DELETE");
          offenesMeeting = null;
          await zeigeMeetings();
        };
    const leiste = aktionen(speichern, loeschen);
    if (gespeichert === m.id) leiste.querySelector(".meldung").textContent = "Gespeichert. Auswählen kannst du das Meeting im Transkriptions-Assistenten.";

    inhalt.append(
      kopfzeile,
      feld("Agenda", agenda, "Ein Punkt pro Zeile. Punkte mit unverändertem Titel behalten ihren Status."),
      feld("Hintergrundwissen", briefing, "Kontext zu Brodos, Kunden, Produkten, Zielen. Die Spezial-Agenten bekommen diesen Text bei jeder Frage mit."),
      feld("Fachbegriffe und Namen", begriffe, `Mit Komma getrennt. Die Transkription schreibt diese Wörter dann richtig, z. B. „DaaS+" statt „das Plus". Auch Namen der Teilnehmenden eintragen.`),
      leiste,
    );
    liste.append(d);
    if (m.neu) name.focus();
  }
  gespeichert = null;
}
$("#meeting-neu").addEventListener("click", () => { offenesMeeting = "neu"; zeigeMeetings(); });

// ── Spezial-Agenten ──
let offenerAgent = null;
let agentGespeichert = null;
let figuren = [];
let farben = [];
const FIGURNAMEN = { sales: "Figur 1 (kurze Haare, Krawatte)", bpm: "Figur 2 (Brille, Bob)", consultant: "Figur 3 (Locken, Bart)", kuerzel: "Kreis mit Anfangsbuchstaben" };

async function zeigeAgenten() {
  const { einstellungen } = await hole("/api/admin/einstellungen");
  const liste = $("#agent-liste");
  liste.replaceChildren();
  const alle = offenerAgent === "neu" ? [{ id: "neu", name: "", beschreibung: "", wissen: "", figur: "kuerzel", farbe: farben[einstellungen.agenten.length % farben.length], neu: true }, ...einstellungen.agenten] : einstellungen.agenten;

  for (const a of alle) {
    const { d, inhalt } = eintrag({
      titel: a.neu ? "Neuer Agent" : a.name,
      info: a.neu ? "noch nicht gespeichert" : a.wissen.length ? `Wissen: ${a.wissen.length.toLocaleString("de-DE")} Zeichen` : "ohne Wissensdatei",
      vorne: figur(a.neu ? { ...a, name: "Neu" } : a),
      offen: offenerAgent === a.id,
    });
    d.addEventListener("toggle", () => { if (d.open) offenerAgent = a.id; else if (offenerAgent === a.id) offenerAgent = null; });

    const name = eingabe("text", a.name, { maxLength: 40, placeholder: "z. B. Legal Counsel" });
    const figurWahl = el("select");
    for (const f of figuren) { const o = el("option", "", FIGURNAMEN[f] ?? f); o.value = f; figurWahl.append(o); }
    figurWahl.value = a.figur;
    const farbWahl = el("div", "farbwahl");
    farbWahl.setAttribute("role", "radiogroup");
    let farbe = a.farbe;
    for (const f of farben) {
      const k = el("button");
      k.type = "button";
      k.style.background = f;
      k.setAttribute("role", "radio");
      k.setAttribute("aria-label", `Farbe ${f}`);
      k.setAttribute("aria-checked", String(f === farbe));
      k.addEventListener("click", () => { farbe = f; for (const x of farbWahl.children) x.setAttribute("aria-checked", String(x === k)); });
      farbWahl.append(k);
    }
    const prompt = eingabe("textarea", a.beschreibung, { rows: 7, maxLength: 8000, placeholder: "Wer ist der Agent? Welche Erfahrung hat er, worauf achtet er, wie antwortet er?" });

    // Wissensdatei: Text einfügen oder .md/.txt-Dateien laden (bleibt im Browser, bis gespeichert wird)
    const wissen = eingabe("textarea", a.wissen, { rows: 7, maxLength: 300000, className: "mono", placeholder: "Noch keine Wissensdatei. Text einfügen oder Datei laden." });
    const zaehler = el("span", "zaehler");
    const zaehle = () => (zaehler.textContent = wissen.value.length ? `${wissen.value.length.toLocaleString("de-DE")} Zeichen` : "leer");
    wissen.addEventListener("input", zaehle);
    zaehle();
    const datei = eingabe("file", "", { accept: ".md,.txt,text/markdown,text/plain", multiple: true, hidden: true });
    datei.addEventListener("change", async () => {
      const texte = await Promise.all([...datei.files].map((f) => f.text()));
      const neu = [wissen.value.trim(), ...texte.map((t) => t.trim())].filter(Boolean).join("\n\n");
      if (neu.length > 300000) return void (zaehler.textContent = "Zu groß: höchstens 300.000 Zeichen pro Agent.");
      wissen.value = neu;
      datei.value = "";
      zaehle();
    });
    const laden = el("button", "zweit klein", "Datei laden (.md)");
    laden.type = "button";
    laden.addEventListener("click", () => datei.click());
    const leeren = el("button", "zweit klein", "Leeren");
    leeren.type = "button";
    leeren.addEventListener("click", () => { wissen.value = ""; zaehle(); });
    const wissenFeld = feld("Wissensdateien", wissen, "Fachwissen des Agenten. Wird nur mitgeschickt, wenn er gefragt ist. Mehrere Dateien werden aneinandergehängt.");
    const leiste = el("div", "wissenleiste");
    leiste.append(zaehler, laden, leeren, datei);
    wissenFeld.insertBefore(leiste, wissen);

    const daten = () => ({ name: name.value, beschreibung: prompt.value, wissen: wissen.value, figur: figurWahl.value, farbe });
    const speichern = async () => {
      const id = a.neu ? (await sende("/api/agenten", daten())).id : (await sende(`/api/agenten/${a.id}`, daten(), "PUT"), a.id);
      offenerAgent = agentGespeichert = id;
      await zeigeAgenten();
    };
    const loeschen = a.neu
      ? async () => { offenerAgent = null; await zeigeAgenten(); }
      : async () => {
          if (!confirm(`Den Agenten „${a.name}" wirklich löschen? Frühere Antworten bleiben im Archiv lesbar.`)) return;
          await sende(`/api/agenten/${a.id}`, {}, "DELETE");
          offenerAgent = null;
          await zeigeAgenten();
        };
    const knoepfe = aktionen(speichern, loeschen);
    if (agentGespeichert === a.id) knoepfe.querySelector(".meldung").textContent = "Gespeichert. Gilt ab der nächsten Frage.";

    const aussehen = el("div", "zweispaltig");
    aussehen.append(feld("Figur", figurWahl), feld("Farbe", farbWahl));
    inhalt.append(feld("Name", name), aussehen, feld("Prompt (Rolle)", prompt), wissenFeld, knoepfe);
    liste.append(d);
    if (a.neu) name.focus();
  }
  agentGespeichert = null;
}
$("#agent-neu").addEventListener("click", () => { offenerAgent = "neu"; zeigeAgenten(); });

// ── Erweitert: Prompts und Obergrenze ──
let standard = null;
const melde = (text) => ($("#meldung").textContent = text);

async function ladeErweitert() {
  const daten = await hole("/api/admin/einstellungen");
  standard = daten.standard;
  figuren = daten.figuren;
  farben = daten.farben;
  const e = daten.einstellungen;
  $("#promptAssistent").value = e.promptAssistent;
  $("#promptAgenten").value = e.promptAgenten;
  $("#promptZusammenfassung").value = e.promptZusammenfassung;
  $("#maxTodos").value = e.maxTodosProZyklus;
  if (![...$("#takt").options].some((o) => Number(o.value) === e.zyklusSekunden)) { const o = el("option", "", `alle ${e.zyklusSekunden} Sekunden`); o.value = e.zyklusSekunden; $("#takt").append(o); }
  $("#takt").value = e.zyklusSekunden;
  $("#wort").value = e.aktivierungswort;
  $("#sprachfragen").checked = e.sprachfragen;
  $("#hinweis").textContent = daten.mock ? "Mock-Modus: Meetings, Agenten-Namen und die Obergrenze wirken sofort. Prompts, Hintergrundwissen und Wissensdateien werden gespeichert, wirken aber erst mit einem echten Sprachmodell." : "";
  ladeVorschau();
}
async function ladeVorschau() {
  const { promptAgenten, zeichen } = await hole("/api/admin/vorschau");
  $("#vorschau pre").textContent = promptAgenten;
  $("#vorschau summary").textContent = `Vorschau: so bekommt ihn das Sprachmodell bei „Frage an alle" im aktiven Meeting (${zeichen.toLocaleString("de-DE")} Zeichen)`;
}
$("#formular").addEventListener("input", () => melde("Ungespeicherte Änderungen"));
$("#formular").addEventListener("submit", async (ereignis) => {
  ereignis.preventDefault();
  try {
    await sende(
      "/api/admin/einstellungen",
      { promptAssistent: $("#promptAssistent").value, promptAgenten: $("#promptAgenten").value, promptZusammenfassung: $("#promptZusammenfassung").value, maxTodosProZyklus: Number($("#maxTodos").value), zyklusSekunden: Number($("#takt").value), aktivierungswort: $("#wort").value, sprachfragen: $("#sprachfragen").checked },
      "PUT",
    );
    melde(`Gespeichert um ${new Date().toLocaleTimeString("de-DE")}.`);
    ladeVorschau();
  } catch (fehler) {
    melde(fehler.message);
  }
});
for (const knopf of document.querySelectorAll("[data-standard]")) {
  knopf.addEventListener("click", () => {
    if (!confirm("Diesen Prompt auf den Standard zurücksetzen? Wirksam erst nach dem Speichern.")) return;
    $(`#${knopf.dataset.standard}`).value = standard[knopf.dataset.standard];
    melde("Ungespeicherte Änderungen");
  });
}

await ladeErweitert();
zeigeMeetings();
zeigeAgenten();
