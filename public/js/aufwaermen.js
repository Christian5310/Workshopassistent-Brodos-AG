// Aufwärmspiel (6-3-5 mit KI) im App-Rahmen, losgelöst von Workshops, Meetings und Agenten. Gesteuert von merlin.js über den Beobachter-Kanal "aufwaermen".
// Der Spielstand lebt nur in diesem Modul (Browser): nichts wird gespeichert, nichts ins Protokoll geschrieben. Die KI-Runden gehen an /api/aufwaermen/runde.
// Texte laufen immer über textContent (kein HTML aus KI-Antworten oder Eingaben).
import { el, icon, sende } from "./common.js";

const GESAMT_SEKUNDEN = 15 * 60; // das ganze Spiel höchstens 15 Minuten
const EINGABE_SEKUNDEN = 3 * 60; // Runde 1: Ideen eintippen
const MIN_IDEEN = 3;
const MAX_IDEEN = 10;

/** Feste Fragestellungen (kein freies Feld) */
const FRAGEN = [
  "Wie könnte KI unseren Vertrieb verrückt gut machen?",
  "Was würde ein KI-Kollege im Vertrieb tun, der nie schläft?",
  "Welche Aufgabe im Vertrieb sollte KI übernehmen, die wir uns heute nicht trauen?",
  "Wie würde KI einen Kunden begeistern, bevor er überhaupt anruft?",
  "Wie würde KI unseren Fachhandelspartnern das Leben leichter machen?",
  "Was passiert, wenn jeder im Vertrieb ab morgen einen persönlichen KI-Zwilling hat?",
];

/** Perspektiven für Runde 4: die App würfelt sie je Kette */
const PERSPEKTIVEN = ["ein Kunde", "der Fachhandel", "ein Konkurrent", "ein Kind", "das Jahr 2035", "ein Sparfuchs im Controlling", "ein Verkäufer am Montagmorgen", "eine Oma beim Handykauf", "ein Roboter-Praktikant"];

const RUNDEN = [
  { titel: "Idee", kurz: "Runde 1", merlin: "" },
  { titel: "Erweitern", kurz: "Runde 2", merlin: "Runde zwei: Die KI erweitert jede Idee." },
  { titel: "Umdrehen", kurz: "Runde 3", merlin: "Runde drei: Die KI dreht jede Idee um." },
  { titel: "Perspektive", kurz: "Runde 4", merlin: "Runde vier: Die KI betrachtet jede Idee aus einer ungewohnten Perspektive. Die Würfel haben entschieden." },
];

const mischen = (liste) => liste.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
const minSek = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.round(s) % 60)).padStart(2, "0")}`;
const warte = (ms) => new Promise((f) => setTimeout(f, ms));

/**
 * @param {object} navi merlin.js, schnittstelle: beobachte(), beendeAufwaermen(), sprich(), verstumme()
 */
export function starteAufwaermen(navi) {
  const wurzel = el("div", "spiel");
  wurzel.hidden = true;
  wurzel.setAttribute("role", "dialog");
  wurzel.setAttribute("aria-label", "Aufwärmspiel");
  document.querySelector(".app-bg").append(wurzel);

  // ── Spielstand (nur hier, nur im Browser) ──
  let phase = "aus"; // aus | start | eingabe | runde | warten | abstimmung | ende
  let frage = "";
  let ketten = []; // { nr, zellen: [text|null ×4], perspektive }
  let runde = 1; // 1..4, die gerade laufende bzw. zuletzt fertige Runde
  let laedt = false;
  let fehler = "";
  let personen = MIN_IDEEN;
  let punkte = new Map(); // "kette-runde" → Anzahl
  let top = [];
  let spielStart = 0;
  let eingabeStart = 0;
  let warnte = false;
  let takt = null;
  let merlinText = "";
  let vorlesen = false;
  let auswahlZelle = null; // Zelle im Bearbeiten
  let lauf = 0; // erhöht sich bei Ende/Neustart, damit alte Antworten verworfen werden

  const sag = (text, sprechen = true) => {
    merlinText = text;
    zeichneMerlin();
    if (sprechen && vorlesen) navi.sprich(text);
  };
  const schluessel = (k, r) => `${k.nr}-${r}`;
  const punkteVon = (k, r) => punkte.get(schluessel(k, r)) ?? 0;
  const vergeben = () => [...punkte.values()].reduce((a, b) => a + b, 0);

  // ── Gerüst (einmal gebaut) ──
  const kopf = el("header", "spiel-kopf");
  const titel = el("h2", "spiel-frage");
  const rundenAnzeige = el("span", "spiel-runde");
  const zeit = el("div", "spiel-zeit");
  const balken = el("i");
  const zeitText = el("span", "spiel-zeit-text");
  zeit.append(balken);
  const zeitBox = el("div", "spiel-zeitbox");
  zeitBox.append(zeit, zeitText);
  const schalter = el("label", "spiel-schalter");
  const haken = el("input");
  haken.type = "checkbox";
  haken.checked = false; // Merlin liest nicht automatisch vor
  haken.addEventListener("change", () => { vorlesen = haken.checked; if (!vorlesen) navi.verstumme(); else if (merlinText) navi.sprich(merlinText); });
  schalter.append(haken, el("span", "", "Merlin liest vor"));
  const ende = el("button", "zweit klein", "Spiel beenden");
  ende.type = "button";
  ende.addEventListener("click", beenden);
  const kopfZeile = el("div", "spiel-kopfzeile");
  kopfZeile.append(rundenAnzeige, zeitBox, schalter, ende);
  kopf.append(titel, kopfZeile);

  const merlinZeile = el("div", "spiel-merlin");
  const merlinBild = el("img");
  merlinBild.src = "/img/merlin-avatar.png";
  merlinBild.alt = "";
  const merlinSprechblase = el("p", "spiel-sprechblase");
  merlinSprechblase.setAttribute("aria-live", "polite");
  const vorlesKnopf = el("button", "zweit klein icon-knopf");
  vorlesKnopf.type = "button";
  vorlesKnopf.title = "Merlin liest diesen Satz vor";
  vorlesKnopf.setAttribute("aria-label", "Merlin liest diesen Satz vor");
  vorlesKnopf.append(icon("lautsprecher"));
  vorlesKnopf.addEventListener("click", () => navi.sprich(merlinText));
  merlinZeile.append(merlinBild, merlinSprechblase, vorlesKnopf);
  new Image().src = "/img/merlin-hoert.webp";

  const inhalt = el("div", "spiel-inhalt");
  const fuss = el("footer", "spiel-fuss");
  wurzel.append(kopf, merlinZeile, inhalt, fuss);

  function zeichneMerlin() {
    merlinSprechblase.textContent = merlinText;
    vorlesKnopf.hidden = !merlinText;
    merlinBild.src = laedt ? "/img/merlin-hoert.webp" : "/img/merlin-avatar.png";
    merlinZeile.classList.toggle("denkt", laedt);
  }

  // ── Zeit: Balken über die 15 Minuten, in der Eingabe zusätzlich die Zeit für Runde 1 ──
  function zeichneZeit() {
    if (phase === "aus") return;
    const vergangen = (Date.now() - spielStart) / 1000;
    const rest = GESAMT_SEKUNDEN - vergangen;
    balken.style.width = `${Math.max(0, Math.min(100, (rest / GESAMT_SEKUNDEN) * 100))}%`;
    zeit.classList.toggle("knapp", rest < 120);
    let text = `Noch ${minSek(rest)} von 15:00`;
    if (phase === "eingabe") {
      const r1 = EINGABE_SEKUNDEN - (Date.now() - eingabeStart) / 1000;
      text = `Runde 1: ${r1 > 0 ? `noch ${minSek(r1)}` : "Zeit ist um"} · ${text}`;
      if (!warnte && r1 <= 60 && r1 > 0) { warnte = true; sag("Noch eine Minute."); }
    }
    zeitText.textContent = rest > 0 ? text : "Die 15 Minuten sind um";
  }

  // ── Anzeige je Phase ──
  function zeichne() {
    titel.textContent = frage || "KI-Aufwärmspiel: 6-3-5 mit KI";
    rundenAnzeige.textContent = phase === "start" ? "Start" : phase === "abstimmung" || phase === "ende" ? "Abstimmung" : `Runde ${runde}/4`;
    zeitBox.hidden = phase === "start";
    zeichneMerlin();
    fuss.replaceChildren();
    if (phase === "start") return zeichneStart();
    if (phase === "eingabe") return zeichneEingabe();
    zeichneTabelle();
    zeichneFuss();
  }

  function zeichneStart() {
    inhalt.className = "spiel-inhalt";
    const liste = el("div", "spiel-fragen");
    for (const f of FRAGEN) {
      const k = el("button", "spiel-frageknopf", f);
      k.type = "button";
      k.addEventListener("click", () => waehleFrage(f));
      liste.append(k);
    }
    inhalt.replaceChildren(el("p", "spiel-anleitung", "Wählt eine Fragestellung:"), liste);
  }

  // Runde 1: eine Person tippt die Ideen von den Zetteln ein
  let eingaben = [];
  function zeichneEingabe() {
    inhalt.className = "spiel-inhalt spiel-eingabe";
    const liste = el("ol", "spiel-ideen");
    eingaben.forEach((text, i) => {
      const li = el("li");
      const feld = el("input");
      feld.type = "text";
      feld.maxLength = 200;
      feld.value = text;
      feld.placeholder = `Idee ${i + 1}`;
      feld.setAttribute("aria-label", `Idee ${i + 1}`);
      feld.addEventListener("input", () => { eingaben[i] = feld.value; pruefeEingabe(); });
      feld.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); (liste.children[i + 1]?.querySelector("input") ?? feld).focus(); }
      });
      const weg = el("button", "zweit klein icon-knopf");
      weg.type = "button";
      weg.title = "Zeile entfernen";
      weg.setAttribute("aria-label", `Idee ${i + 1} entfernen`);
      weg.append(icon("x"));
      weg.disabled = eingaben.length <= MIN_IDEEN;
      weg.addEventListener("click", () => { eingaben.splice(i, 1); zeichne(); });
      li.append(feld, weg);
      liste.append(li);
    });
    const mehr = el("button", "zweit klein");
    mehr.type = "button";
    mehr.append(icon("plus"), "Zeile hinzufügen");
    mehr.disabled = eingaben.length >= MAX_IDEEN;
    mehr.addEventListener("click", () => { eingaben.push(""); zeichne(); liste.lastElementChild?.querySelector("input")?.focus(); });
    inhalt.replaceChildren(el("p", "spiel-anleitung", "Eine Person tippt die Ideen von den Zetteln ein, eine Zeile je Idee (mindestens drei)."), liste, mehr);
    fuss.replaceChildren(abgabe);
    pruefeEingabe();
  }
  const abgabe = el("button", "", "");
  abgabe.type = "button";
  abgabe.append(icon("pfeil"), "Ideen abgeben: die KI übernimmt");
  abgabe.addEventListener("click", gibIdeenAb);
  function pruefeEingabe() {
    const anzahl = eingaben.filter((t) => t.trim()).length;
    abgabe.disabled = anzahl < MIN_IDEEN;
    abgabe.title = anzahl < MIN_IDEEN ? `Noch ${MIN_IDEEN - anzahl} Idee(n) eintragen` : "";
  }

  // ── Tabelle wie der klassische 6-3-5-Bogen ──
  function zeichneTabelle() {
    inhalt.className = `spiel-inhalt${ketten.length > 6 ? " eng" : ""}`;
    const tabelle = el("table", "spiel-tabelle");
    const kopfZ = el("tr");
    kopfZ.append(el("th", "nr", "#"));
    RUNDEN.forEach((r, i) => {
      const th = el("th", i + 1 === runde && phase === "runde" ? "aktiv" : "");
      th.append(el("b", "", r.kurz), el("span", "", r.titel));
      kopfZ.append(th);
    });
    const thead = el("thead");
    thead.append(kopfZ);
    tabelle.append(thead);
    const koerper = el("tbody");
    for (const k of ketten) {
      const z = el("tr");
      z.append(el("th", "nr", String(k.nr)));
      for (let r = 1; r <= 4; r++) z.append(zelle(k, r));
      koerper.append(z);
    }
    tabelle.append(koerper);
    inhalt.replaceChildren(tabelle);
  }

  function zelle(k, r) {
    const td = el("td");
    const text = k.zellen[r - 1];
    const gesperrt = laedt && r <= runde; // Merlin denkt gerade
    if (r === 4 && k.perspektive && (r < runde || runde === 4)) {
      // Würfel-Symbol mit der Perspektive: schon vor der Antwort sichtbar, damit alle sehen, was gewürfelt wurde
      const w = el("span", "wuerfel");
      w.append(icon("wuerfel"), el("span", "", k.perspektive));
      td.append(w);
    }
    if (text === null || text === undefined) {
      if (gesperrt) { td.classList.add("denkt"); td.append(el("span", "punkte-denken", "…")); }
      return td;
    }
    td.classList.add("gefuellt");
    if (k.neu?.has(r)) td.classList.add("neu");
    const istTop = top.some((t) => t.kette === k.nr && t.runde === r);
    if (istTop) td.classList.add("top");
    if (auswahlZelle && auswahlZelle.k === k && auswahlZelle.r === r) {
      td.append(bearbeiter(k, r));
      return td;
    }
    const knopf = el("button", "zelle-knopf");
    knopf.type = "button";
    knopf.append(el("span", "zelle-text", text));
    knopf.title = phase === "abstimmung" ? "Klick: einen Punkt vergeben" : "Klick: bearbeiten oder neu würfeln";
    knopf.disabled = laedt || phase === "ende";
    knopf.addEventListener("click", () => klickZelle(k, r));
    td.append(knopf);
    const p = punkteVon(k, r);
    if (p) {
      const b = el("button", "zelle-punkte", `${p} ★`);
      b.type = "button";
      b.title = "Klick nimmt einen Punkt zurück";
      b.disabled = phase !== "abstimmung";
      b.addEventListener("click", (e) => { e.stopPropagation(); setzePunkt(k, r, -1); });
      td.append(b);
    }
    if (istTop) td.append(el("span", "zelle-platz", `Platz ${top.findIndex((t) => t.kette === k.nr && t.runde === r) + 1}`));
    return td;
  }

  function klickZelle(k, r) {
    if (phase === "abstimmung") return setzePunkt(k, r, +1);
    if (phase !== "warten" && phase !== "runde") return;
    if (phase === "runde" && laedt) return;
    auswahlZelle = { k, r };
    zeichne();
  }

  /** Eine Zelle bearbeiten oder einzeln neu würfeln: der Mensch behält die Kontrolle */
  function bearbeiter(k, r) {
    const box = el("div", "zelle-bearbeiten");
    const feld = el("textarea");
    feld.rows = 3;
    feld.maxLength = 300;
    feld.value = k.zellen[r - 1];
    feld.setAttribute("aria-label", `Text von Kette ${k.nr}, Runde ${r}`);
    const reihe = el("div", "reihe");
    const speichern = el("button", "klein");
    speichern.type = "button";
    speichern.append(icon("check"), "Übernehmen");
    speichern.addEventListener("click", () => { const t = feld.value.trim(); if (t) k.zellen[r - 1] = t; auswahlZelle = null; zeichne(); });
    reihe.append(speichern);
    if (r > 1) {
      const wuerfeln = el("button", "zweit klein");
      wuerfeln.type = "button";
      wuerfeln.append(icon("wuerfel"), "Neu würfeln");
      wuerfeln.addEventListener("click", () => wuerfleNeu(k, r));
      reihe.append(wuerfeln);
    }
    const zu = el("button", "textlink klein-text", "Abbrechen");
    zu.type = "button";
    zu.addEventListener("click", () => { auswahlZelle = null; zeichne(); });
    reihe.append(zu);
    box.append(feld, reihe);
    setTimeout(() => feld.focus(), 0);
    return box;
  }

  async function wuerfleNeu(k, r) {
    const mein = lauf;
    const basis = k.zellen[r - 2];
    if (!basis) return;
    auswahlZelle = null;
    laedt = true;
    k.zellen[r - 1] = null;
    zeichne();
    try {
      const antwort = await sende("/api/aufwaermen/runde", { frage, runde: r, ketten: [{ nr: k.nr, text: basis, ...(r === 4 && k.perspektive ? { perspektive: k.perspektive } : {}) }] });
      if (mein !== lauf) return;
      k.zellen[r - 1] = antwort.ketten[0]?.text ?? basis;
      k.neu = new Set([r]);
    } catch (f) {
      if (mein !== lauf) return;
      k.zellen[r - 1] = basis; // altes Ergebnis darf nicht verloren gehen
      fehler = f.message;
      sag("Das hat nicht geklappt. Versucht es noch einmal.", false);
    }
    laedt = false;
    zeichne();
  }

  // ── Fußzeile je Phase ──
  function zeichneFuss() {
    fuss.replaceChildren();
    if (fehler && phase === "runde") {
      const meldung = el("p", "spiel-fehler", `${fehler} Ihr könnt es nochmal versuchen.`);
      const nochmal = el("button", "");
      nochmal.type = "button";
      nochmal.append(icon("undo"), "Nochmal versuchen");
      nochmal.addEventListener("click", () => starteRunde(runde));
      fuss.append(meldung, nochmal);
      return;
    }
    if (phase === "runde") {
      if (laedt) return void fuss.append(el("p", "gedaempft", "Merlin denkt …"));
    }
    if (phase === "warten") {
      const k = el("button", "");
      k.type = "button";
      k.append(icon("pfeil"), runde < 4 ? `Weiter zu Runde ${runde + 1}` : "Weiter zur Abstimmung");
      k.addEventListener("click", weiter);
      fuss.append(el("p", "gedaempft", "Alle lesen kurz. Zellen lassen sich antippen und ändern."), k);
    }
    if (phase === "abstimmung") {
      const links = 2 * personen - vergeben();
      const zaehler = el("div", "spiel-personen");
      const minus = el("button", "zweit klein icon-knopf", "−");
      minus.type = "button";
      minus.setAttribute("aria-label", "Eine Person weniger");
      minus.disabled = personen <= 3;
      minus.addEventListener("click", () => { personen--; zeichneFuss(); });
      const plus = el("button", "zweit klein icon-knopf", "+");
      plus.type = "button";
      plus.setAttribute("aria-label", "Eine Person mehr");
      plus.disabled = personen >= 10;
      plus.addEventListener("click", () => { personen++; zeichneFuss(); });
      zaehler.append(el("span", "", "Personen:"), minus, el("b", "", String(personen)), plus);
      const fertig = el("button", "");
      fertig.type = "button";
      fertig.append(icon("check"), "Top 3 zeigen");
      fertig.disabled = vergeben() === 0;
      fertig.addEventListener("click", zeigeTop);
      fuss.append(zaehler, el("p", "spiel-punkte", `Jede Person hat 2 Punkte: ${links >= 0 ? `noch ${links} zu vergeben` : `${-links} zu viel vergeben`}`), fertig);
    }
    if (phase === "ende") {
      const dl = el("button", "");
      dl.type = "button";
      dl.append(icon("download"), "Top-Ideen herunterladen");
      dl.addEventListener("click", ladeHerunter);
      const nochmal = el("button", "zweit");
      nochmal.type = "button";
      nochmal.append(icon("undo"), "Neues Spiel");
      nochmal.addEventListener("click", () => neuesSpiel());
      const zu = el("button", "zweit");
      zu.type = "button";
      zu.textContent = "Schließen";
      zu.addEventListener("click", () => beenden(true));
      fuss.append(dl, nochmal, zu);
    }
  }

  // ── Ablauf ──
  function waehleFrage(f) {
    frage = f;
    phase = "eingabe";
    runde = 1;
    spielStart = Date.now();
    eingabeStart = Date.now();
    warnte = false;
    eingaben = ["", "", "", ""];
    sag("Jetzt schreibt jeder eine verrückte KI-Idee auf einen Zettel. Eine Person tippt sie danach hier ein.");
    zeichne();
    zeichneZeit();
    setTimeout(() => inhalt.querySelector("input")?.focus(), 50);
  }

  function gibIdeenAb() {
    const ideen = eingaben.map((t) => t.trim()).filter(Boolean);
    if (ideen.length < MIN_IDEEN) return;
    ketten = ideen.map((text, i) => ({ nr: i + 1, zellen: [text, null, null, null], perspektive: "", neu: new Set() }));
    personen = Math.min(10, Math.max(3, ketten.length));
    // Runde 4: die App würfelt je Kette eine Perspektive, möglichst ohne Wiederholung
    const wuerfel = mischen(PERSPEKTIVEN);
    ketten.forEach((k, i) => { k.perspektive = wuerfel[i % wuerfel.length]; });
    starteRunde(2);
  }

  async function starteRunde(r) {
    const mein = ++lauf;
    runde = r;
    phase = "runde";
    laedt = true;
    fehler = "";
    auswahlZelle = null;
    sag(RUNDEN[r - 1].merlin);
    for (const k of ketten) k.zellen[r - 1] = null;
    zeichne();
    const anfrage = ketten.map((k) => ({ nr: k.nr, text: k.zellen[r - 2], ...(r === 4 ? { perspektive: k.perspektive } : {}) }));
    try {
      const antwort = await sende("/api/aufwaermen/runde", { frage, runde: r, ketten: anfrage });
      if (mein !== lauf) return;
      // Neue Zellen erscheinen nacheinander
      for (const k of ketten) {
        k.zellen[r - 1] = antwort.ketten.find((x) => x.nr === k.nr)?.text ?? "…";
        for (const x of ketten) x.neu = new Set(); // nur die jeweils neueste Zelle animiert
        k.neu.add(r);
        zeichneTabelle();
        await warte(450);
        if (mein !== lauf) return;
      }
      for (const x of ketten) x.neu = new Set();
      laedt = false;
      phase = "warten";
      sag("Lest die Ergebnisse kurz durch. Dann geht es weiter.");
    } catch (f) {
      if (mein !== lauf) return;
      laedt = false;
      fehler = f.message || "Das hat nicht geklappt.";
      sag("Die KI hat gerade nicht geantwortet.", false);
    }
    zeichne();
  }

  function weiter() {
    if (phase === "warten") {
      auswahlZelle = null;
      if (runde < 4) starteRunde(runde + 1);
      else {
        phase = "abstimmung";
        sag(`Zeit zum Abstimmen: Jede Person hat zwei Punkte. Tippt die Ideen an, die ihr am besten findet.`);
        zeichne();
      }
    } else if (phase === "abstimmung" && vergeben() > 0) zeigeTop();
  }

  function setzePunkt(k, r, delta) {
    const key = schluessel(k, r);
    const neu = (punkte.get(key) ?? 0) + delta;
    if (delta > 0 && vergeben() >= 2 * personen) return void sag(`Alle ${2 * personen} Punkte sind vergeben. Nehmt einen zurück, wenn ihr umlegen wollt.`, false);
    if (neu <= 0) punkte.delete(key);
    else punkte.set(key, neu);
    zeichne();
  }

  function zeigeTop() {
    const alle = [];
    for (const k of ketten) for (let r = 1; r <= 4; r++) { const p = punkteVon(k, r); if (p && k.zellen[r - 1]) alle.push({ kette: k.nr, runde: r, punkte: p, text: k.zellen[r - 1] }); }
    alle.sort((a, b) => b.punkte - a.punkte || b.runde - a.runde || a.kette - b.kette);
    top = alle.slice(0, 3);
    phase = "ende";
    const nenne = (t, i) => `Platz ${i + 1}: ${t.text.replace(/[.!?]+$/, "")}`;
    sag(top.length ? `Das sind eure Top ${top.length}. ${top.map(nenne).join(". ")}.` : "Es wurden keine Punkte vergeben.");
    zeichne();
  }

  function ladeHerunter() {
    const k = (nr) => ketten.find((x) => x.nr === nr);
    const zeilen = [`# Top-Ideen aus dem KI-Aufwärmspiel`, "", `**Fragestellung:** ${frage}`, `**Datum:** ${new Date().toLocaleDateString("de-DE")}`, ""];
    top.forEach((t, i) => {
      zeilen.push(`## ${i + 1}. ${t.text}`, "", `- Punkte: ${t.punkte}`, `- Aus Runde ${t.runde} (${RUNDEN[t.runde - 1].titel}), Ideenkette ${t.kette}`);
      const kette = k(t.kette);
      kette?.zellen.slice(0, t.runde).forEach((z, r) => { if (z) zeilen.push(`  - ${RUNDEN[r].kurz} (${RUNDEN[r].titel}${r === 3 && kette.perspektive ? `: ${kette.perspektive}` : ""}): ${z}`); });
      zeilen.push("");
    });
    const blob = new Blob([zeilen.join("\n")], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "top-ideen-aufwaermspiel.md";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function neuesSpiel() {
    lauf++;
    phase = "start";
    frage = "";
    ketten = [];
    punkte = new Map();
    top = [];
    runde = 1;
    laedt = false;
    fehler = "";
    auswahlZelle = null;
    sag("Wählt eine Fragestellung. Jede Person schreibt danach eine verrückte KI-Idee auf, die KI spielt dann drei Runden weiter.");
    zeichne();
  }

  // ── Öffnen und Schließen ──
  function oeffne() {
    if (phase !== "aus") return;
    wurzel.hidden = false;
    void wurzel.offsetWidth;
    wurzel.classList.add("an");
    haken.checked = vorlesen = false;
    phase = "start";
    neuesSpiel();
    clearInterval(takt);
    takt = setInterval(zeichneZeit, 500);
  }
  /** Beendet das Spiel. Mit "still" ohne Rückfrage. */
  function beenden(still = false) {
    if (phase === "aus") return;
    const mitInhalt = ketten.length > 0 && phase !== "ende";
    if (!still && mitInhalt && !confirm("Spiel wirklich beenden? Die Ideen gehen dabei verloren.")) return;
    navi.beendeAufwaermen();
  }
  function schliesse() {
    lauf++;
    clearInterval(takt);
    navi.verstumme();
    phase = "aus";
    laedt = false;
    ketten = [];
    punkte = new Map();
    top = [];
    eingaben = [];
    frage = "";
    wurzel.classList.remove("an");
    setTimeout(() => { if (phase === "aus") wurzel.hidden = true; }, 400);
  }

  wurzel.addEventListener("keydown", (e) => { if (e.key === "Escape" && phase !== "aus") { e.stopPropagation(); beenden(); } });

  navi.beobachte({
    aufwaermen: (s) => {
      if (s?.aus) schliesse();
      else if (s?.weiter) weiter();
      else oeffne();
    },
  });
  return { laeuft: () => phase !== "aus" };
}
