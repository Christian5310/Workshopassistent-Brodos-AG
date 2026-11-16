import { avatar, el, gehe, icon, imRahmen, knopf, sende } from "./common.js";

imRahmen("admin");

const $ = (id) => document.querySelector(id);
const hole = async (pfad) => (await fetch(pfad)).json();
const datumKurz = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("de-DE");

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
  const pfeil = el("span", "pfeil");
  pfeil.append(icon("runter"));
  kopf.append(el("span", "titel", titel), el("span", "info", info), pfeil);
  const inhalt = el("div", "eintrag-inhalt");
  d.append(kopf, inhalt);
  return { d, inhalt };
}
function aktionen(speichern, loeschen) {
  const reihe = el("div", "reihe");
  const meldung = el("span", "meldung");
  meldung.setAttribute("role", "status");
  const s = knopf("Speichern", "check");
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
    const l = knopf("Löschen", "trash", "zweit");
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
  const alle = (await hole("/api/tage")).filter((m) => !m.workshop);
  const liste = $("#meeting-liste");
  liste.replaceChildren();
  if (!alle.length) liste.append(el("p", "gedaempft kasten-inhalt", "Noch keine Meetings. Neue legst du im Bereich Meeting an."));

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
    if (gespeichert === m.id) leiste.querySelector(".meldung").textContent = "Gespeichert.";

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

// ── Workshops: bearbeiten und löschen (anlegen im Bereich Workshop) ──
let offenerWorkshop = null;
let workshopGespeichert = null;

async function zeigeWorkshops() {
  const alle = await hole("/api/workshops");
  const liste = $("#workshop-liste");
  liste.replaceChildren();
  if (!alle.length) liste.append(el("p", "gedaempft", "Noch keine Workshops. Neue legst du im Bereich Workshop an."));
  for (const w of alle) {
    const { d, inhalt } = eintrag({
      titel: w.name,
      info: `${datumKurz(w.datum)} · ${w.teilnehmer.length} Teilnehmer · ${w.material.length} Material`,
      offen: offenerWorkshop === w.id,
    });
    d.addEventListener("toggle", () => { if (d.open) offenerWorkshop = w.id; else if (offenerWorkshop === w.id) offenerWorkshop = null; });
    const name = eingabe("text", w.name, { maxLength: 80 });
    const datum = eingabe("date", w.datum);
    const agenda = eingabe("textarea", w.agenda.join("\n"), { rows: 5 });
    const teilnehmer = eingabe("textarea", w.teilnehmer.map((t) => (t.rolle ? `${t.name}, ${t.rolle}` : t.name)).join("\n"), { rows: 5, placeholder: "Name, Rolle" });
    const kopfzeile = el("div", "zweispaltig");
    kopfzeile.append(feld("Name", name), feld("Datum", datum));

    const speichern = async () => {
      await sende(`/api/workshops/${w.id}`, {
        name: name.value,
        datum: datum.value,
        agenda: agenda.value.split("\n").map((z) => z.trim()).filter(Boolean),
        teilnehmer: teilnehmer.value.split("\n").map((z) => z.trim()).filter(Boolean).map((z) => { const [n, ...r] = z.split(","); return { name: n.trim(), rolle: r.join(",").trim() }; }),
      }, "PUT");
      offenerWorkshop = workshopGespeichert = w.id;
      await zeigeWorkshops();
    };
    const loeschen = async () => {
      if (!confirm(`Den Workshop „${w.name}" mit seinem Material (${w.material.length} Einträge) wirklich löschen? Das Meeting des Workshops mit Transkript und To-dos bleibt im Archiv und kann dort gelöscht werden.`)) return;
      await sende(`/api/workshops/${w.id}`, {}, "DELETE");
      try { if (sessionStorage.getItem("broki-ws") === w.id) sessionStorage.removeItem("broki-ws"); } catch {}
      offenerWorkshop = null;
      await zeigeWorkshops();
      zeigeMeetings(); // das Meeting erscheint jetzt als normales Meeting
    };
    const leiste = aktionen(speichern, loeschen);
    const material = knopf("Material bearbeiten", "text", "zweit");
    material.addEventListener("click", () => {
      try { sessionStorage.setItem("broki-ws", w.id); sessionStorage.setItem("broki-ws-bereich", "material"); sessionStorage.setItem("broki-ws-direkt", "1"); } catch {}
      gehe("workshop");
    });
    leiste.insertBefore(material, leiste.querySelector(".meldung"));
    if (workshopGespeichert === w.id) leiste.querySelector(".meldung").textContent = "Gespeichert.";
    inhalt.append(
      kopfzeile,
      feld("Agenda", agenda, "Ein Punkt pro Zeile. Gilt auch für das Meeting des Workshops."),
      feld("Teilnehmer", teilnehmer, "Ein Eintrag pro Zeile: Name, Rolle."),
      leiste,
    );
    liste.append(d);
  }
  workshopGespeichert = null;
}

// ── Spezial-Agenten ──
let offenerAgent = null;
let agentGespeichert = null;
let figuren = [];
let farben = [];
const FIGURNAMEN = { sales: "Aktentasche (Vertrieb)", bpm: "Ablauf (Prozesse)", consultant: "Trend (Strategie)", kuerzel: "Person (allgemein)" };

async function zeigeAgenten() {
  const { einstellungen } = await hole("/api/admin/einstellungen");
  const liste = $("#agent-liste");
  liste.replaceChildren();
  const alle = offenerAgent === "neu" ? [{ id: "neu", name: "", beschreibung: "", wissen: "", figur: "kuerzel", farbe: farben[einstellungen.agenten.length % farben.length], neu: true }, ...einstellungen.agenten] : einstellungen.agenten;

  for (const a of alle) {
    const { d, inhalt } = eintrag({
      titel: a.neu ? "Neuer Agent" : a.name,
      info: a.neu ? "noch nicht gespeichert" : a.wissen.length ? `Wissen: ${a.wissen.length.toLocaleString("de-DE")} Zeichen` : "ohne Wissensdatei",
      vorne: avatar(a.neu ? { ...a, name: "Neu" } : a, "klein"),
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
    const laden = knopf("Datei laden (.md)", "plus", "zweit klein");
    laden.addEventListener("click", () => datei.click());
    const leeren = knopf("Leeren", "x", "zweit klein");
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
    aussehen.append(feld("Symbol", figurWahl), feld("Farbe", farbWahl));
    inhalt.append(feld("Name", name), aussehen, feld("Prompt (Rolle)", prompt), wissenFeld, knoepfe);
    liste.append(d);
    if (a.neu) name.focus();
  }
  agentGespeichert = null;
}
$("#agent-neu").addEventListener("click", () => { offenerAgent = "neu"; zeigeAgenten(); });

// ── Transkription: Mistral (Cloud) oder lokales Whisper, sofort umschaltbar ──
const STT = [
  ["mistral", "Mistral Voxtral", "Cloud (EU). Sehr schnell und genau, braucht Internet und den Mistral-Schlüssel."],
  ["whisper-large", "Whisper large-v3", "Lokal auf diesem PC. Genau wie Mistral, ohne Grafikkarte aber langsam: kann mit dem 30-Sekunden-Takt nicht mithalten."],
  ["whisper-turbo", "Whisper Turbo", "Lokal auf diesem PC. Etwa viermal schneller als large-v3, etwas ungenauer bei Fachbegriffen."],
];
async function zeigeTranskription(aktuell) {
  const ziel = $("#stt-wahl");
  ziel.replaceChildren(
    ...STT.map(([id, name, text]) => {
      const zeile = el("label", `stt-option${id === aktuell ? " ist-aktiv" : ""}`);
      const r = el("input");
      r.type = "radio";
      r.name = "stt";
      r.value = id;
      r.checked = id === aktuell;
      r.addEventListener("change", async () => {
        try {
          await sende("/api/admin/einstellungen", { transkription: id }, "PUT");
          $("#stt-meldung").textContent = `Umgestellt auf ${name}.`;
          zeigeTranskription(id);
        } catch (fehler) {
          $("#stt-meldung").textContent = fehler.message;
        }
      });
      const beschriftung = el("span");
      beschriftung.append(el("b", "", name), el("span", "klein-text gedaempft", text));
      zeile.append(r, beschriftung);
      return zeile;
    }),
  );
  try {
    const a = await hole("/api/regie/anbieter");
    $("#stt-status").replaceChildren(...a.meldungen.filter((m) => /Whisper|MISTRAL/.test(m)).map((m) => el("p", /NICHT/.test(m) ? "warnung" : "", m)));
  } catch {}
}

// ── Grundeinstellungen (Meetings) und Erweitert (Merlin-Bubble, Prompts) ──
let standard = null;
const melde = (text) => ($("#meldung").textContent = text);
const meldeGrund = (text) => ($("#grund-meldung").textContent = text);
const tempoText = () => ($("#tempo-wert").textContent = Number($("#lesetempo").value).toLocaleString("de-DE", { minimumFractionDigits: 2 }));
let gewuenschteStimme = "";

/** Stimmen des Browsers; deutsche zuerst. Kommen in Chrome erst nach "voiceschanged". */
function fuelleStimmen() {
  if (!("speechSynthesis" in window)) return void $("#stimme").replaceChildren(el("option", "", "Dieser Browser kann nicht vorlesen"));
  const alle = speechSynthesis.getVoices();
  const deutsch = alle.filter((v) => v.lang?.toLowerCase().startsWith("de"));
  const liste = deutsch.length ? deutsch : alle;
  const auto = el("option", "", "Automatisch: erste deutsche Stimme");
  auto.value = "";
  const optionen = liste.map((v) => { const o = el("option", "", `${v.name} (${v.lang})`); o.value = v.name; return o; });
  if (gewuenschteStimme && !liste.some((v) => v.name === gewuenschteStimme)) {
    const o = el("option", "", `${gewuenschteStimme} (auf diesem Gerät nicht vorhanden)`);
    o.value = gewuenschteStimme;
    optionen.unshift(o);
  }
  $("#stimme").replaceChildren(auto, ...optionen);
  $("#stimme").value = gewuenschteStimme;
}
if ("speechSynthesis" in window) speechSynthesis.addEventListener?.("voiceschanged", fuelleStimmen);

async function ladeErweitert() {
  const daten = await hole("/api/admin/einstellungen");
  standard = daten.standard;
  figuren = daten.figuren;
  farben = daten.farben;
  const e = daten.einstellungen;
  $("#promptAssistent").value = e.promptAssistent;
  // Wird der Transkriptionsassistent in Broki gepflegt (LLM_MODEL_PROTOKOLL), gilt dieses Feld nicht
  const extern = daten.promptExtern;
  $("#promptAssistent").readOnly = !!extern;
  $("#prompt-extern").hidden = !extern;
  if (extern) $("#prompt-extern").textContent = `Wird in Broki gepflegt: Modell „${extern}" (${daten.llmBasis}). Rolle und Regeln dort ändern. Dieses Feld gilt nur ohne Broki-Modell, z. B. mit Mistral.`;
  $("#promptAgenten").value = e.promptAgenten;
  $("#promptZusammenfassung").value = e.promptZusammenfassung;
  $("#maxTodos").value = e.maxTodosProZyklus;
  if (![...$("#takt").options].some((o) => Number(o.value) === e.zyklusSekunden)) { const o = el("option", "", `alle ${e.zyklusSekunden} Sekunden`); o.value = e.zyklusSekunden; $("#takt").append(o); }
  $("#takt").value = e.zyklusSekunden;
  $("#wort").value = e.aktivierungswort;
  $("#sprachfragen").checked = e.sprachfragen;
  gewuenschteStimme = e.stimme;
  $("#lesetempo").value = e.lesetempo;
  zeigeTranskription(e.transkription);
  $("#pauseAn").checked = e.pauseAn;
  $("#pauseMinuten").value = e.pauseMinuten;
  $("#pauseSprechen").checked = e.pauseSprechen;
  tempoText();
  fuelleStimmen();
  $("#hinweis").textContent = daten.mock ? "Mock-Modus: Meetings, Agenten-Namen und die Obergrenze wirken sofort. Prompts, Hintergrundwissen und Wissensdateien werden gespeichert, wirken aber erst mit einem echten Sprachmodell." : "";
  ladeVorschau();
}
async function ladeVorschau() {
  const { promptAgenten, zeichen } = await hole("/api/admin/vorschau");
  $("#vorschau pre").textContent = promptAgenten;
  $("#vorschau summary").textContent = `Vorschau: so bekommt ihn das Sprachmodell bei „Frage an alle" im aktiven Meeting (${zeichen.toLocaleString("de-DE")} Zeichen)`;
}

$("#grund-formular").addEventListener("input", () => meldeGrund("Ungespeicherte Änderungen"));
$("#grund-formular").addEventListener("submit", async (ereignis) => {
  ereignis.preventDefault();
  try {
    await sende("/api/admin/einstellungen", { maxTodosProZyklus: Number($("#maxTodos").value), zyklusSekunden: Number($("#takt").value), aktivierungswort: $("#wort").value, sprachfragen: $("#sprachfragen").checked }, "PUT");
    meldeGrund(`Gespeichert um ${new Date().toLocaleTimeString("de-DE")}.`);
  } catch (fehler) {
    meldeGrund(fehler.message);
  }
});

$("#lesetempo").addEventListener("input", tempoText);
$("#stimme").addEventListener("change", () => (gewuenschteStimme = $("#stimme").value));
$("#probe").addEventListener("click", () => {
  if (!("speechSynthesis" in window)) return;
  speechSynthesis.cancel();
  const satz = new SpeechSynthesisUtterance(`Hallo, ich bin ${$("#wort").value || "Merlin"}. So klinge ich im Workshop.`);
  satz.lang = "de-DE";
  satz.voice = speechSynthesis.getVoices().find((v) => v.name === $("#stimme").value) ?? speechSynthesis.getVoices().find((v) => v.lang?.startsWith("de")) ?? null;
  satz.rate = Number($("#lesetempo").value);
  speechSynthesis.speak(satz);
});

$("#formular").addEventListener("input", () => melde("Ungespeicherte Änderungen"));
$("#formular").addEventListener("submit", async (ereignis) => {
  ereignis.preventDefault();
  try {
    await sende(
      "/api/admin/einstellungen",
      { promptAssistent: $("#promptAssistent").value, promptAgenten: $("#promptAgenten").value, promptZusammenfassung: $("#promptZusammenfassung").value, stimme: $("#stimme").value, lesetempo: Number($("#lesetempo").value), pauseAn: $("#pauseAn").checked, pauseMinuten: Number($("#pauseMinuten").value), pauseSprechen: $("#pauseSprechen").checked },
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

// ── Auswahl links: ein Bereich ist sichtbar ──
const BEREICHE = [["meetings", "Meetings", "kalender"], ["workshops", "Workshops", "liste"], ["agenten", "Spezial-Agenten", "users"], ["erweitert", "Erweitert", "regler"]];
let bereich = "meetings";
try { bereich = sessionStorage.getItem("merlin-admin") ?? bereich; } catch {}
function zeigeBereich() {
  $("#bereichswahl").replaceChildren(
    ...BEREICHE.map(([id, name, iconName]) => {
      const k = el("button", `select-item${id === bereich ? " is-active" : ""}`);
      k.type = "button";
      k.setAttribute("aria-pressed", String(id === bereich));
      k.append(icon(iconName), el("span", "", name));
      k.addEventListener("click", () => {
        bereich = id;
        try { sessionStorage.setItem("merlin-admin", id); } catch {}
        zeigeBereich();
      });
      return k;
    }),
  );
  for (const [id] of BEREICHE) $(`#b-${id}`).hidden = id !== bereich;
}

$("#agent-neu").append(icon("plus"), "Neuer Agent");
$("#erweitert-speichern").append(icon("check"), "Speichern");
$("#grund-speichern").append(icon("check"), "Speichern");
$("#probe").append(icon("play"), "Probe hören");
if (!BEREICHE.some(([id]) => id === bereich)) bereich = "meetings";
zeigeBereich();
await ladeErweitert();
await Promise.all([zeigeMeetings(), zeigeWorkshops(), zeigeAgenten()]);

// Auftrag von Merlin ("Wo ändere ich die Lesegeschwindigkeit?"): Feld zeigen und kurz hervorheben
try {
  const auftrag = JSON.parse(sessionStorage.getItem("merlin-auftrag") ?? "null");
  if (auftrag?.aktion === "einstellung") {
    sessionStorage.removeItem("merlin-auftrag");
    const ziel = document.getElementById(auftrag.feld);
    const rahmen = ziel?.closest(".feld") ?? ziel;
    if (rahmen) {
      rahmen.scrollIntoView({ behavior: "smooth", block: "center" });
      rahmen.classList.add("merlin-markiert");
      setTimeout(() => rahmen.classList.remove("merlin-markiert"), 4000);
      if (ziel.matches("input, select, textarea")) ziel.focus({ preventScroll: true });
    }
  }
} catch {}
