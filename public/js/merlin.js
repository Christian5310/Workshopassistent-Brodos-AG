// Merlin als Navigator im App-Rahmen: schwebt außerhalb des weißen Fensters, ist in allen Bereichen da.
// - Befehle per Texteingabe, Vorschlag oder Sprache (Klick aufs Mikrofon: zuhören, nochmal klicken: senden)
// - Einstimmung: Begrüßung, Eingereichtes, Regeln, Agenda (Texte je Meeting, vorlesbar)
// - Pausen-Erinnerung nach einstellbarer Zeit (Admin → Erweitert)
// Was Merlin ausführt, geht dieselben Wege wie ein Klick. Löschen kann er nicht.
// Ohne Klick gesagt ("Merlin, To-do für …") wirkt nur auf das Protokoll des Meeting Assistenten.
import { el, icon, sende } from "./common.js";
import { FUEHRUNG } from "./fuehrung-stationen.js";

const $ = (id) => document.querySelector(id);
const STATIONEN = [["begruessung", "Begrüßung"], ["eingereicht", "Eingereicht"], ["regeln", "Regeln"], ["agenda", "Agenda"]];
const MAX_HOEREN_MS = 12_000;

/**
 * @param {object} rahmen Zugriff auf den App-Rahmen
 * @param {(ziel: string, neuLaden?: boolean) => void} rahmen.gehe
 * @param {() => string} rahmen.bereich
 * @param {object} rahmen.steuerung window.merlin (starten, pausieren, aufnahme)
 * @param {() => boolean} rahmen.istAufnahmegeraet
 * @param {(namen: string[]) => void} [rahmen.licht] lässt Punkte der Navigation leuchten (Führung durch die App)
 */
export function starteMerlin(rahmen) {
  let stand = null;
  let offen = false;
  let modus = "navi"; // "navi" | "ansage"
  let ansagen = null; // { __tag, begruessung, eingereicht, regeln, agenda }
  let station = 0;
  let bearbeitet = false;
  let hoert = false;
  let rekorder = null;
  let hoerTimer = null;
  let abbruch = null; // laufende Aktion mit Abbrechen-Möglichkeit
  let offeneFrage = null; // { ja, nein }: Merlins Rückfrage, beantwortbar per Klick oder per Sprache ("Ja", "Nein")
  let naechsteErinnerung = null;
  let erinnerungFuer = null;
  let fuehrung = null; // laufende Führung durch die App: { aus: boolean, weiter: () => void }
  let fuehrungStand = null; // aktuelle Station, damit eine neu geladene Startseite mittendrin einsteigen kann

  // ── Anzeige ──
  const knopf = $("#merlin-knopf");
  const panel = $("#merlin");
  const blase = $("#merlin-blase");
  const info = (text = "") => ($("#merlin-info").textContent = text);
  /** Beobachter von außen (Merlin in der Mitte der Startseite): bekommen Antworten und Zustand mit */
  const beobachter = new Set();
  const melde = (art, wert) => { for (const b of beobachter) try { b[art]?.(wert); } catch { beobachter.delete(b); } };
  const BILD = { ruhig: "/img/merlin-avatar.png", hoert: "/img/merlin-hoert.webp" };
  new Image().src = BILD.hoert; // vorladen
  const zustand = (name) => {
    melde("zustand", name);
    const aktiv = name === "hoert" || name === "denkt";
    knopf.classList.toggle("aktiv", aktiv);
    knopf.querySelector("img").src = aktiv ? BILD.hoert : BILD.ruhig;
    for (const k of ["hoert", "denkt", "spricht"]) knopf.classList.toggle(k, k === name);
    $("#merlin-mikro").classList.toggle("hoert", name === "hoert");
    $("#merlin-mikro").setAttribute("aria-pressed", String(name === "hoert"));
  };
  const sage = (text) => {
    modus = "navi";
    blase.textContent = text;
    melde("sage", text);
    zeigeAnsageLeiste();
  };

  function oeffne({ fokus = false } = {}) {
    offen = true;
    panel.hidden = false;
    knopf.setAttribute("aria-expanded", "true");
    zeigeLeise();
    zeigeVorschlaege();
    if (!blase.textContent) sage(begruessungstext());
    if (fokus) $("#merlin-feld").focus();
  }
  function schliesse() {
    verstumme();
    hoerAbbrechen();
    offen = false;
    panel.hidden = true;
    knopf.setAttribute("aria-expanded", "false");
    zeigeLeise();
  }
  // Die Bubble ist reine Sprachsteuerung: Klick = zuhören, noch ein Klick = fertig. Ein Fenster gibt es nur für Antworten.
  knopf.addEventListener("click", () => hoerStart());
  /** Antwort sichtbar machen: im Fenster, auf der Startseite in Merlins Sprechblase in der Mitte */
  const zeigeAntwort = () => { if (!offen && rahmen.bereich() !== "start") oeffne({ fokus: false }); };
  zeigeLeise(); // gleich beim Laden, nicht erst mit dem ersten Stand vom Server
  $("#merlin-zu").addEventListener("click", schliesse);
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (fuehrung) beendeFuehrung();
    else if (offen) schliesse();
  });

  function begruessungstext() {
    const b = rahmen.bereich();
    if (b === "start") return "Hallo, ich bin Merlin. Möchtest du ein Meeting oder einen Workshop abhalten?";
    if (!stand?.tag) return "Was soll ich tun? Du kannst tippen, einen Vorschlag anklicken oder auf das Mikrofon klicken und sprechen.";
    return `Wir sind in „${stand.tag.name}“. Was soll ich tun?`;
  }

  /** Während der Aufnahme: ruhig und fast durchsichtig. Auf der Startseite schwebt Merlin in der Mitte, hier unten nicht. */
  function zeigeLeise() {
    const auf = stand?.status?.aufnahme === true;
    knopf.classList.toggle("leise", auf && !offen);
    knopf.classList.toggle("schwebt", !auf);
    knopf.hidden = rahmen.bereich() === "start" && !offen;
  }

  // ── Vorschläge je Bereich ──
  function vorschlaege() {
    const b = rahmen.bereich();
    const meeting = !!stand?.tag;
    const auf = stand?.status?.aufnahme === true;
    const workshop = !!stand?.workshop;
    if (b === "start") return ["Neues Meeting", "Meetings", "Workshops", "Was kannst du?"];
    if (b === "meeting") return ["Neues Meeting", "Zur Auswahl", ...(meeting ? ["Zum Meeting Assistenten"] : [])];
    if (b === "workshop") return ["Neuer Workshop", "Zur Auswahl", ...(meeting ? ["Zum Meeting Assistenten"] : [])];
    if (!meeting) return ["Zur Auswahl", "Neues Meeting", "Was kannst du?"];
    const aufnahme = auf ? "Pause" : "Aufnahme starten";
    if (b === "assistent") return [aufnahme, "Begrüße alle", "Lies die Agenda vor", ...(workshop ? ["Fasse das Material zusammen"] : []), "Zu den Agenten"];
    if (b === "agenten") return [aufnahme, "Zum Meeting Assistenten", "Lies die Agenda vor"];
    return ["Zum Meeting Assistenten", "Zu den Agenten", aufnahme];
  }
  let auswahl = []; // von Merlin angebotene Ziele, z. B. die vorhandenen Meetings
  function zeigeVorschlaege() {
    // Nur Sprache: feste Vorschläge entfallen, angezeigt wird nur eine Auswahl, die Merlin anbietet (z. B. mehrere Meetings)
    $("#merlin-vorschlaege").hidden = !auswahl.length;
    const knoepfe = auswahl;
    $("#merlin-vorschlaege").replaceChildren(
      ...knoepfe.map((a) => {
        const k = el("button", `merlin-chip${a.einfach ? "" : " ziel"}`);
        k.type = "button";
        if (!a.einfach) k.append(icon(a.link ? "text" : a.archiv ? "archive" : "pfeil"));
        k.append(a.text);
        k.addEventListener("click", () => {
          if (a.link) return void window.open(a.link, "_blank", "noopener"); // Material in neuem Tab
          if (a.archiv) {
            merkeAuftrag({ aktion: "archiv", id: a.archiv });
            sage(`Ich öffne „${a.text.replace(/ \(Archiv\)$/, "")}“ im Archiv.`);
            return void rahmen.gehe("archiv", true);
          }
          befehl(a.befehl, false);
        });
        return k;
      }),
    );
  }

  // ── Befehl: Text an den Server, Aktion hier ausführen ──
  async function befehl(text, gesprochen) {
    if (!text.trim()) return;
    auswahl = [];
    abbrechen();
    info("");
    zustand("denkt");
    const geduld = setTimeout(() => sage("Einen Moment …"), 400);
    try {
      const e = await sende("/api/merlin/befehl", { text, bereich: rahmen.bereich() });
      clearTimeout(geduld);
      if (e.ki) info(`Per KI zugeordnet (${(e.ms / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} s)`);
      await ausfuehren(e, gesprochen);
    } catch (fehler) {
      clearTimeout(geduld);
      sage(fehler.message);
    } finally {
      if (!knopf.classList.contains("spricht")) zustand(null);
    }
  }
  $("#merlin-eingabe").addEventListener("submit", (e) => {
    e.preventDefault();
    const feld = $("#merlin-feld");
    befehl(feld.value, false);
    feld.value = "";
  });

  /** Aktionen, die woandershin führen: dort zeigt sich das Ergebnis, ein Antwortfenster braucht es nicht */
  const FUEHRT_WEITER = new Set(["gehe", "einstellung", "meeting-neu", "workshop-neu", "meeting-oeffnen", "workshop-oeffnen", "frage", "dokument", "fuehrung"]);
  async function ausfuehren(e, gesprochen) {
    if (e.aktion === "ja" || e.aktion === "nein") {
      const frage = offeneFrage;
      if (!frage) return void (zeigeAntwort(), sage(e.aktion === "ja" ? "Wobei soll ich ja sagen? Ich habe gerade nichts gefragt." : "Gut."));
      abbrechen();
      try { await (e.aktion === "ja" ? frage.ja() : frage.nein()); } catch (f) { sage(f.message); }
      return;
    }
    abbrechen();
    auswahl = e.auswahl ?? [];
    if (FUEHRT_WEITER.has(e.aktion) && !auswahl.length) { if (offen) schliesse(); }
    else zeigeAntwort();
    const antworte = (text = e.antwort) => { sage(text); if (gesprochen) sprich(text); };
    switch (e.aktion) {
      case "gehe":
        antworte();
        rahmen.gehe(e.ziel);
        break;
      case "einstellung":
        // Admin öffnet den Bereich und hebt das Feld hervor (public/js/admin.js)
        try { sessionStorage.setItem("merlin-admin", e.bereich); } catch {}
        merkeAuftrag({ aktion: "einstellung", feld: e.feld });
        antworte();
        rahmen.gehe("admin", true);
        setTimeout(() => { if (!hoert) schliesse(); }, 1500); // sonst verdeckt das Panel das markierte Feld
        break;
      case "meeting-neu":
        merkeAuftrag({ aktion: "meeting-neu", name: e.name });
        antworte();
        rahmen.gehe("meeting", true);
        break;
      case "workshop-neu":
        try { sessionStorage.removeItem("broki-ws"); sessionStorage.setItem("broki-ws-bereich", "ueberblick"); } catch {}
        merkeAuftrag({ aktion: "workshop-neu" });
        antworte();
        rahmen.gehe("workshop", true);
        break;
      case "meeting-oeffnen":
        await sende(`/api/tage/${e.id}/aktivieren`);
        antworte();
        rahmen.gehe("assistent", true);
        break;
      case "workshop-oeffnen":
        await sende(`/api/workshops/${e.id}/oeffnen`);
        try { sessionStorage.setItem("broki-ws", e.id); } catch {}
        antworte();
        rahmen.gehe("assistent", true);
        break;
      case "aufnahme-start":
        // Kurz Zeit zum Abbrechen, falls Merlin sich verhört hat
        mitAbbruch(e.antwort, gesprochen, async () => {
          await rahmen.steuerung.starten();
          sage("Die Aufnahme läuft. Ich bin jetzt leise.");
          if (rahmen.bereich() !== "assistent" && rahmen.bereich() !== "agenten") rahmen.gehe("assistent");
        });
        break;
      case "aufnahme-pause":
        await rahmen.steuerung.pausieren();
        antworte("Die Aufnahme ist pausiert. Alles bleibt erhalten.");
        break;
      case "meeting-schliessen":
        rueckfrage(e.antwort, gesprochen, "Ja, schließen", async () => {
          if (stand?.status?.aufnahme) await rahmen.steuerung.pausieren();
          await sende("/api/meeting/schliessen");
          sage("Das Meeting ist geschlossen. Alles liegt im Archiv.");
          rahmen.gehe("archiv");
        });
        break;
      case "ansage":
        await zeigeAnsage(STATIONEN.findIndex(([id]) => id === e.station), true);
        break;
      case "fuehrung":
        starteFuehrung(); // läuft für sich weiter, hier nicht warten
        break;
      case "agenda-fehlt":
        rueckfrage(e.antwort, gesprochen, "Ja, Agenda anlegen", async () => {
          if (e.workshop) {
            try { sessionStorage.setItem("broki-ws-bereich", "ueberblick"); } catch {}
            sage("Hier richtest du den Workshop ein. Die Agenda trägst du im Feld Agenda ein, ein Punkt pro Zeile.");
            rahmen.gehe("workshop", true);
          } else {
            try { sessionStorage.setItem("merlin-admin", "meetings"); } catch {}
            merkeAuftrag({ aktion: "einstellung", feld: "meeting-liste" });
            sage("Hier pflegst du die Meetings. Öffne dein Meeting und trag die Agenda ein, ein Punkt pro Zeile.");
            rahmen.gehe("admin", true);
          }
          setTimeout(() => { if (!hoert) schliesse(); }, 2500);
        });
        break;
      case "dokument": {
        antworte();
        // Neues Fenster aus einem Sprachbefehl kann der Browser blockieren: dann als Knopf anbieten
        const fenster = window.open(e.link, "_blank", "noopener");
        if (!fenster) {
          auswahl = [{ text: e.titel, link: e.link }];
          zeigeAntwort();
          sage(`Der Browser hat das Fenster blockiert. Klick auf „${e.titel}“, dann öffne ich es.`);
        }
        break;
      }
      case "wissen": {
        antworte();
        if (e.quelle) auswahl = [{ text: `Dokument öffnen: ${e.quelle.titel}`, link: e.quelle.link }];
        frageNachMehr(e.frage, gesprochen);
        break;
      }
      case "frage":
        // Nicht auf die Antwort warten: die Agenten antworten im Chat, Merlin wechselt sofort dorthin
        sende("/api/chat", { text: e.text, an: e.an }).catch((f) => sage(f.message));
        antworte();
        rahmen.gehe("agenten");
        break;
      default:
        antworte();
    }
    zeigeVorschlaege();
  }

  function merkeAuftrag(auftrag) {
    try { sessionStorage.setItem("merlin-auftrag", JSON.stringify(auftrag)); } catch {}
  }

  /** Zeigt "Abbrechen" für 2,5 Sekunden, dann wird ausgeführt. */
  function mitAbbruch(text, gesprochen, aktion) {
    sage(text);
    if (gesprochen) sprich(text);
    const leiste = $("#merlin-rueckfrage");
    const nein = el("button", "zweit klein");
    nein.type = "button";
    nein.append(icon("x"), "Abbrechen");
    leiste.replaceChildren(nein);
    leiste.hidden = false;
    const t = setTimeout(async () => {
      leiste.hidden = true;
      abbruch = null;
      try { await aktion(); } catch (f) { sage(f.message); }
    }, 2500);
    abbruch = () => { clearTimeout(t); leiste.hidden = true; abbruch = null; };
    nein.addEventListener("click", () => { abbrechen(); sage("Abgebrochen."); });
  }
  /** Fragt mit Ja/Nein nach. */
  function rueckfrage(text, gesprochen, jaText, aktion, mitNein = true) {
    sage(text);
    if (gesprochen) sprich(text);
    const leiste = $("#merlin-rueckfrage");
    const ja = el("button", "klein");
    ja.type = "button";
    ja.append(icon("check"), jaText);
    const nein = el("button", "zweit klein");
    nein.type = "button";
    nein.append(icon("x"), "Nein");
    leiste.replaceChildren(ja, ...(mitNein ? [nein] : []));
    leiste.hidden = false;
    const beiJa = async () => { abbrechen(); try { await aktion(); } catch (f) { sage(f.message); } };
    const beiNein = () => { abbrechen(); sage("Gut, ich lasse es."); };
    offeneFrage = { ja: beiJa, nein: beiNein };
    abbruch = () => { leiste.hidden = true; abbruch = null; offeneFrage = null; };
    ja.addEventListener("click", beiJa);
    nein.addEventListener("click", beiNein);
  }
  /** Nach einer kurzen Antwort aus dem Material: "Mehr vorlesen?" (Ja per Klick oder Sprache) */
  function frageNachMehr(frage, gesprochen) {
    const leiste = $("#merlin-rueckfrage");
    const mehr = el("button", "klein");
    mehr.type = "button";
    mehr.append(icon("play"), "Mehr vorlesen");
    leiste.replaceChildren(mehr);
    leiste.hidden = false;
    const beiJa = async () => {
      abbrechen();
      zustand("denkt");
      sage("Einen Moment, ich lese genauer nach …");
      try {
        const e = await sende("/api/merlin/wissen", { frage, mehr: true });
        sage(e.antwort);
        sprich(e.antwort);
      } catch (f) {
        sage(f.message);
      } finally {
        if (!knopf.classList.contains("spricht")) zustand(null);
      }
    };
    offeneFrage = { ja: beiJa, nein: () => { abbrechen(); sage("Gut."); } };
    abbruch = () => { leiste.hidden = true; abbruch = null; offeneFrage = null; };
    mehr.addEventListener("click", beiJa);
  }
  function abbrechen() {
    abbruch?.();
  }

  // ── Sprechen: Klick aufs Mikrofon = zuhören, nochmal Klick = senden ──
  async function hoerStart() {
    if (fuehrung) return beendeFuehrung(); // ein Klick auf Merlin oder das Mikrofon unterbricht die Führung
    if (hoert) return hoerEnde();
    verstumme();
    if (!offeneFrage) abbrechen();
    info("");
    hoert = true;
    auswahl = [];
    zustand("hoert");
    sage("Ich höre zu … Klick noch einmal, wenn du fertig bist.");
    rahmen.steuerung.aufnahme.stumm = true; // der Befehl soll nicht im Meeting-Protokoll landen
    if (stand?.status?.quelle !== "mikro") {
      hoerTimer = setTimeout(hoerEnde, 1200); // Mock ohne Mikrofon: Beispielsatz vom Server
      return;
    }
    try {
      const strom = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
      if (!hoert) return void strom.getTracks().forEach((t) => t.stop());
      const teile = [];
      const r = new MediaRecorder(strom, { audioBitsPerSecond: 32000 });
      r.addEventListener("dataavailable", (e) => e.data.size && teile.push(e.data));
      r.addEventListener("stop", () => {
        strom.getTracks().forEach((t) => t.stop());
        if (r.verworfen) return;
        sendeAudio(new Blob(teile, { type: r.mimeType || "audio/webm" }));
      });
      r.start();
      rekorder = r;
      hoerTimer = setTimeout(hoerEnde, MAX_HOEREN_MS);
    } catch (fehler) {
      hoerAbbrechen();
      zeigeAntwort();
      sage(fehler.name === "NotAllowedError" ? "Ich darf das Mikrofon nicht benutzen. Bitte im Browser erlauben oder tippen." : "Das Mikrofon lässt sich nicht öffnen. Bitte tippen.");
    }
  }
  function hoerEnde() {
    if (!hoert) return;
    hoert = false;
    clearTimeout(hoerTimer);
    rahmen.steuerung.aufnahme.stumm = false;
    zustand("denkt");
    sage("Einen Moment …");
    if (rekorder?.state === "recording") rekorder.stop();
    else if (stand?.status?.quelle !== "mikro") sendeAudio(null);
    rekorder = null;
  }
  function hoerAbbrechen() {
    if (!hoert) return;
    hoert = false;
    clearTimeout(hoerTimer);
    rahmen.steuerung.aufnahme.stumm = false;
    if (rekorder) { rekorder.verworfen = true; if (rekorder.state === "recording") rekorder.stop(); }
    rekorder = null;
    zustand(null);
  }
  async function sendeAudio(blob) {
    try {
      const antwort = await fetch(`/api/merlin/audio?bereich=${encodeURIComponent(rahmen.bereich())}`, {
        method: "POST",
        headers: { "Content-Type": blob ? blob.type.split(";")[0] : "audio/webm" },
        body: blob ?? new Blob([]),
      });
      const e = await antwort.json();
      if (!antwort.ok) throw new Error(e.fehler ?? `Fehler ${antwort.status}`);
      info(`Verstanden: „${e.erkannt}“${e.ki ? ` · per KI zugeordnet (${(e.ms / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} s)` : ""}`);
      await ausfuehren(e, true);
    } catch (fehler) {
      sage(fehler.message);
      zeigeAntwort();
    } finally {
      if (!knopf.classList.contains("spricht")) zustand(null);
    }
  }
  $("#merlin-mikro").addEventListener("click", hoerStart);

  // ── Vorlesen (Stimme und Tempo aus Admin → Erweitert). Solange Merlin spricht, ist das Mikrofon stumm. ──
  const stimme = () => {
    const v = stand?.vorlesen ?? {};
    const alle = speechSynthesis.getVoices();
    return alle.find((s) => v.stimme && s.name === v.stimme) ?? alle.find((s) => s.lang?.startsWith("de")) ?? null;
  };
  function sprich(text, beiEnde = null) {
    if (!("speechSynthesis" in window) || !text) return;
    speechSynthesis.cancel();
    const satz = new SpeechSynthesisUtterance(text);
    satz.lang = "de-DE";
    satz.voice = stimme();
    satz.rate = stand?.vorlesen?.tempo ?? 0.98;
    satz.onend = satz.onerror = () => { verstumme(); beiEnde?.(); };
    rahmen.steuerung.aufnahme.stumm = true; // Merlin soll sich nicht selbst mitschreiben
    zustand("spricht");
    if (modus === "ansage") beschrifte($("#merlin-sprechen"), "pause", "Stopp");
    speechSynthesis.speak(satz);
  }
  function verstumme() {
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    if (!hoert) rahmen.steuerung.aufnahme.stumm = false;
    if (knopf.classList.contains("spricht")) zustand(null);
    beschrifte($("#merlin-sprechen"), "play", "Vorlesen");
  }
  const beschrifte = (k, iconName, text) => k.replaceChildren(icon(iconName), text);

  // ── Einstimmung: vier Stationen mit Texten je Meeting ──
  async function ladeAnsagen(neu = false) {
    const id = stand?.tag?.id;
    if (!id) throw new Error("Dafür brauche ich ein geöffnetes Meeting.");
    if (!neu && ansagen?.__tag === id) return;
    info("Merlin bereitet die Texte vor …");
    zustand("denkt");
    try {
      const antwort = await fetch(`/api/tage/${id}/ansagen${neu ? "?neu" : ""}`);
      if (!antwort.ok) throw new Error((await antwort.json().catch(() => ({}))).fehler ?? `Fehler ${antwort.status}`);
      ansagen = { ...(await antwort.json()), __tag: id };
    } finally {
      info("");
      zustand(null);
    }
  }
  async function zeigeAnsage(index, vorlesen) {
    if (!offen) oeffne({ fokus: false });
    await ladeAnsagen();
    modus = "ansage";
    station = Math.max(0, index);
    bearbeitet = false;
    zeigeAnsageLeiste();
    if (vorlesen) sprich(blase.textContent);
  }
  function zeigeAnsageLeiste() {
    const istAnsage = modus === "ansage";
    $("#merlin-stationen").hidden = $("#merlin-ansage-leiste").hidden = !istAnsage;
    if (!istAnsage) {
      blase.hidden = false;
      $("#merlin-text").hidden = true;
      return;
    }
    $("#merlin-stationen").replaceChildren(
      ...STATIONEN.map(([, name], i) => {
        const k = el("button", `merlin-station${i === station ? " ist-aktiv" : ""}`, name);
        k.type = "button";
        k.setAttribute("role", "tab");
        k.setAttribute("aria-selected", String(i === station));
        k.addEventListener("click", () => { verstumme(); station = i; bearbeitet = false; zeigeAnsageLeiste(); });
        return k;
      }),
    );
    const text = ansagen?.[STATIONEN[station][0]] ?? "";
    blase.textContent = text;
    $("#merlin-text").value = text;
    blase.hidden = bearbeitet;
    $("#merlin-text").hidden = !bearbeitet;
    $("#merlin-bearbeiten").textContent = bearbeitet ? "Text speichern" : "Text bearbeiten";
    $("#merlin-weiter").hidden = station === STATIONEN.length - 1;
  }
  $("#merlin-sprechen").addEventListener("click", () => (knopf.classList.contains("spricht") ? verstumme() : sprich(blase.textContent)));
  $("#merlin-weiter").addEventListener("click", () => { verstumme(); station = Math.min(station + 1, STATIONEN.length - 1); zeigeAnsageLeiste(); sprich(blase.textContent); });
  $("#merlin-bearbeiten").addEventListener("click", async () => {
    try {
      if (bearbeitet) {
        ansagen[STATIONEN[station][0]] = $("#merlin-text").value;
        const { __tag, ...texte } = ansagen;
        await sende(`/api/tage/${__tag}/ansagen`, texte, "PUT");
      }
      bearbeitet = !bearbeitet;
      zeigeAnsageLeiste();
    } catch (f) { info(f.message); }
  });
  $("#merlin-neu").addEventListener("click", async () => {
    if (!confirm("Alle vier Texte neu entwerfen? Eigene Änderungen gehen dabei verloren.")) return;
    verstumme();
    try { await ladeAnsagen(true); zeigeAnsageLeiste(); } catch (f) { info(f.message); }
  });
  $("#merlin-zurueck").addEventListener("click", () => { verstumme(); sage(begruessungstext()); });

  // ── Führung durch die App: Merlin bleibt auf dem Startscreen, spricht und zeigt Bilder (public/js/fuehrung-stationen.js) ──
  const warte = (ms) => new Promise((fertig) => setTimeout(fertig, ms));
  /** Liest einen Text satzweise vor und wartet bis zum Ende. Satzweise, weil manche Browser-Stimmen bei langen Texten abbrechen. */
  async function sprichBis(text, lauf) {
    const tempo = stand?.vorlesen?.tempo ?? 0.98;
    for (const satz of text.split(/(?<=[.!?])\s+/).filter(Boolean)) {
      if (lauf.aus) return;
      const geschaetzt = Math.max(1200, (satz.length * 65) / tempo);
      const start = Date.now();
      await new Promise((fertig) => {
        lauf.weiter = fertig;
        if (!("speechSynthesis" in window)) return void setTimeout(fertig, geschaetzt);
        sprich(satz, () => {
          // Viel zu schnell fertig: Der Browser hat das Vorlesen wohl nicht erlaubt. Dann bleibt der Text so lange stehen, wie man ihn liest.
          const dauer = Date.now() - start;
          setTimeout(fertig, dauer < geschaetzt * 0.35 ? geschaetzt - dauer : 0);
        });
      });
    }
  }
  async function starteFuehrung() {
    if (fuehrung) return;
    if (stand?.tag || stand?.status?.aufnahme) {
      zeigeAntwort();
      return void sage("Die Führung gibt es nur ohne geöffnetes Meeting. Schließ das Meeting oder den Workshop, dann zeige ich euch die App.");
    }
    const lauf = { aus: false, weiter: null };
    fuehrung = lauf;
    verstumme();
    hoerAbbrechen();
    abbrechen();
    auswahl = [];
    if (offen) schliesse();
    // Die Führung läuft auf dem Startscreen. Von woanders (ohne offenes Meeting) gehen wir zuerst dorthin.
    if (rahmen.bereich() !== "start") rahmen.gehe("start", true);
    for (let i = 0; i < 40 && !beobachter.size && !lauf.aus; i++) await warte(100);
    if (lauf.aus) return;
    for (const s of FUEHRUNG) if (s.bild) new Image().src = `/img/fuehrung/${s.bild}.png`; // vorladen
    for (const [i, s] of FUEHRUNG.entries()) {
      if (lauf.aus) return;
      rahmen.licht?.(s.licht ?? []);
      fuehrungStand = { index: i, gesamt: FUEHRUNG.length, bild: s.bild ?? null, titel: s.titel ?? "" };
      melde("fuehrung", fuehrungStand);
      sage(s.text);
      await sprichBis(s.text, lauf);
      if (lauf.aus) return;
      await warte(i === FUEHRUNG.length - 1 ? 0 : 600);
    }
    if (lauf.aus) return;
    fuehrung = null;
    fuehrungStand = null;
    rahmen.licht?.([]);
    melde("fuehrung", { aus: true, fertig: true }); // Startscreen: Meeting und Workshop stehen wieder zur Wahl
  }
  /** Beendet die Führung (Klick auf Merlin, Esc, "Führung beenden"). Sie läuft immer auf dem Startscreen, der dann wie gewohnt dasteht. */
  function beendeFuehrung() {
    if (!fuehrung) return;
    const lauf = fuehrung;
    fuehrung = null;
    fuehrungStand = null;
    lauf.aus = true;
    verstumme();
    lauf.weiter?.();
    rahmen.licht?.([]);
    melde("fuehrung", { aus: true, fertig: false });
  }

  // ── Pausen-Erinnerung ──
  function pruefePause() {
    const p = stand?.pause;
    const seit = stand?.status?.aufnahmeSeit;
    if (!p?.an || !stand?.status?.aufnahme || !seit) { naechsteErinnerung = null; erinnerungFuer = null; return; }
    if (erinnerungFuer !== seit) { erinnerungFuer = seit; naechsteErinnerung = seit + p.minuten * 60_000; }
    if (Date.now() < naechsteErinnerung) return;
    naechsteErinnerung = Date.now() + 10 * 60_000; // ohne Antwort in 10 Minuten noch einmal
    const minuten = Math.round((Date.now() - seit) / 60_000);
    const text = `Ihr seid jetzt seit ${minuten} Minuten dran. Wollen wir eine kurze Pause machen?`;
    oeffne({ fokus: false });
    rueckfrage(text, p.sprechen && rahmen.istAufnahmegeraet(), "Pause machen", async () => {
      await rahmen.steuerung.pausieren();
      sage("Pause. Die Aufnahme ist angehalten, alles bleibt erhalten. Sag Bescheid, wenn es weitergeht.");
    }, false);
    const spaeter = el("button", "zweit klein");
    spaeter.type = "button";
    spaeter.append(icon("undo"), "In 10 Minuten");
    spaeter.addEventListener("click", () => { abbrechen(); naechsteErinnerung = Date.now() + 10 * 60_000; sage("Gut, ich erinnere euch in 10 Minuten noch einmal."); });
    $("#merlin-rueckfrage").append(spaeter);
  }
  setInterval(pruefePause, 15_000);

  // ── Startseite: Merlin in der Mitte öffnet dasselbe Panel ──
  const schnittstelle = {
    oeffne,
    hoere: () => { oeffne({ fokus: false }); hoerStart(); },
    /** Nur zuhören, ohne das Fenster zu öffnen (Mikrofon am Merlin der Startseite) */
    hoereLeise: () => hoerStart(),
    hoerAbbrechen: () => hoerAbbrechen(),
    beobachte: (b) => {
      beobachter.add(b);
      // Startseite wurde während der Führung (neu) geladen: sofort die aktuelle Station zeigen
      if (fuehrung && fuehrungStand) { b.fuehrung?.(fuehrungStand); b.sage?.(blase.textContent); }
      return () => beobachter.delete(b);
    },
    starteFuehrung: () => starteFuehrung(),
    beendeFuehrung: () => beendeFuehrung(),
  };

  return {
    schnittstelle,
    /** Neuer Stand vom Server */
    aktualisiere(neu) {
      const tagVorher = stand?.tag?.id;
      stand = neu;
      if (fuehrung && (neu.tag || neu.status?.aufnahme)) beendeFuehrung(); // z. B. von einem anderen Gerät aus ein Meeting geöffnet
      if (tagVorher !== stand.tag?.id) { ansagen = null; if (modus === "ansage") sage(begruessungstext()); }
      zeigeLeise();
      if (offen) zeigeVorschlaege();
      pruefePause();
    },
    /** Bereich gewechselt */
    bereichGewechselt() {
      if (fuehrung && rahmen.bereich() !== "start") beendeFuehrung(); // wer selbst woanders hinklickt, beendet die Führung
      if (rahmen.bereich() === "start" && offen) schliesse(); // Start hat seinen eigenen Merlin in der Mitte
      zeigeLeise();
      if (offen) zeigeVorschlaege();
    },
  };
}
