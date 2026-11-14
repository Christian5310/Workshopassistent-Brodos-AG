// Workshops: der größere Rahmen. Aus einem Fenster: Workshop anlegen, Material sammeln, Assistent und Agenten steuern.
import { el, gehe, icon, imRahmen, knopf, sende, verbinde } from "./common.js";

imRahmen("workshop");
const $ = (id) => document.querySelector(id);
const hole = async (pfad) => (await fetch(pfad)).json();
const melde = (text) => ($("#meldung").textContent = text);
const versuche = (aktion) => async (ereignis) => {
  ereignis?.preventDefault?.();
  melde("");
  try {
    await aktion();
  } catch (fehler) {
    melde(fehler.message);
  }
};
const beschrifte = (id, iconName, text) => $(id).replaceChildren(icon(iconName), text);
const option = (wert, text) => { const o = el("option", "", text); o.value = wert; return o; };
const datum = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("de-DE");
const NEU = "__neu__";

let liste = []; // alle Workshops (Kurzinfo)
let aktuell = null; // gewählter Workshop oder null (= neuer Workshop)
let stand = null; // letzter Stand vom Server (geöffnetes Meeting, Aufnahme …)
const BEREICHE = [["ueberblick", "Einrichten", "kalender"], ["material", "Material", "text"]];
let bereich = "ueberblick";
try { bereich = sessionStorage.getItem("broki-ws-bereich") ?? bereich; } catch {}
const merke = (schluessel, wert) => { try { sessionStorage.setItem(schluessel, wert); } catch {} };

// ── Workshop wählen ──
async function lade(waehle) {
  liste = await hole("/api/workshops");
  let id = waehle;
  if (id === undefined) { try { id = sessionStorage.getItem("broki-ws"); } catch {} }
  aktuell = liste.find((w) => w.id === id) ?? null;
  const wahl = $("#ws-wahl");
  wahl.replaceChildren(option(NEU, "Neuen Workshop einrichten"), ...liste.map((w) => option(w.id, `${w.name} · ${datum(w.datum)}`)));
  wahl.value = aktuell?.id ?? NEU;
  if (aktuell) merke("broki-ws", aktuell.id);
  zeige();
}
// Bestehenden Workshop wählen: direkt ins Fenster zum Abhalten. Neu: erst einrichten.
$("#ws-wahl").addEventListener("change", versuche(async () => {
  const id = $("#ws-wahl").value;
  if (id === NEU) {
    try { sessionStorage.removeItem("broki-ws"); } catch {}
    return void (await lade(null));
  }
  await lade(id);
  if (aktuell?.meetingVorhanden && !(stand?.status.aufnahme && stand.tag?.id !== aktuell.meetingId)) await oeffne("assistent");
}));

function zeige() {
  const neu = aktuell === null;
  if (neu) bereich = "ueberblick";
  $("#bereich-titel").hidden = neu;
  $("#bereiche").replaceChildren(
    ...(neu ? [] : BEREICHE).map(([id, name, iconName]) => {
      const k = el("button", `select-item${id === bereich ? " is-active" : ""}`);
      k.type = "button";
      k.setAttribute("aria-pressed", String(id === bereich));
      const text = el("span");
      text.append(name);
      if (id === "material") text.append(el("span", "zusatz", `${aktuell.material.length} Einträge`));
      k.append(icon(iconName), text);
      k.addEventListener("click", () => { bereich = id; merke("broki-ws-bereich", id); melde(""); zeige(); });
      return k;
    }),
  );
  if (!BEREICHE.some(([id]) => id === bereich)) bereich = "ueberblick";
  $("#titel").textContent = neu ? "Workshop Assistent" : aktuell.name;
  $("#unterzeile").textContent = neu
    ? "Richte einen neuen Workshop ein oder wähle links einen bestehenden. Mit dem Workshop entsteht auch sein Meeting Assistent."
    : `${datum(aktuell.datum)} · ${aktuell.teilnehmer.length} Teilnehmer · ${aktuell.material.length} Material-Einträge`;
  for (const [id] of BEREICHE) $(`#b-${id}`).hidden = id !== bereich;
  if (bereich === "ueberblick") zeigeUeberblick();
  if (bereich === "material") zeigeMaterial();
  zeigeAbhaltenWs();
}

// ── Überblick / Neuer Workshop ──
function teilnehmerZeile(t = { name: "", rolle: "" }) {
  const zeile = el("div", "tn-zeile");
  const name = el("input");
  name.type = "text";
  name.maxLength = 60;
  name.placeholder = "Name";
  name.value = t.name;
  name.setAttribute("aria-label", "Name");
  const rolle = el("input");
  rolle.type = "text";
  rolle.maxLength = 80;
  rolle.placeholder = "Rolle";
  rolle.value = t.rolle;
  rolle.setAttribute("aria-label", "Rolle");
  const weg = knopf("", "trash", "zweit klein");
  weg.setAttribute("aria-label", "Teilnehmer entfernen");
  weg.addEventListener("click", () => zeile.remove());
  zeile.append(name, rolle, weg);
  return zeile;
}
function zeigeUeberblick() {
  const neu = aktuell === null;
  $("#kennzahlen").hidden = neu;
  if (!neu) {
    $("#kennzahlen").replaceChildren(
      ...[["Teilnehmer", aktuell.teilnehmer.length], ["Agendapunkte", aktuell.agenda.length], ["Material", aktuell.material.length], ["Vorwissen", aktuell.briefing.trim() ? "übernommen" : "offen"]].map(([bez, wert]) => {
        const k = el("div", "kennzahl");
        k.append(el("div", "bezeichnung", bez), el("div", "wert", String(wert)));
        return k;
      }),
    );
  }
  $("#form-titel").textContent = neu ? "Neuen Workshop einrichten" : "Rahmen und Teilnehmer";
  $("#ws-name").value = aktuell?.name ?? "";
  $("#ws-datum").value = aktuell?.datum ?? new Date().toLocaleDateString("sv-SE");
  $("#ws-agenda").value = (aktuell?.agenda ?? []).join("\n");
  $("#teilnehmer").replaceChildren(...(aktuell?.teilnehmer ?? []).map(teilnehmerZeile));
  beschrifte("#ws-speichern", "check", "Speichern");
  beschrifte("#ws-weiter", "pfeil", neu ? "Workshop einrichten und weiter" : "Weiter");
  $("#ws-speichern").hidden = $("#ws-loeschen").hidden = neu;
}
$("#tn-neu").addEventListener("click", () => {
  const zeile = teilnehmerZeile();
  $("#teilnehmer").append(zeile);
  zeile.querySelector("input").focus();
});
// Speichern bleibt auf der Seite; "Weiter" speichert und führt zum nächsten Schritt (Material).
async function speichereWorkshop() {
  const daten = {
    name: $("#ws-name").value,
    datum: $("#ws-datum").value,
    agenda: $("#ws-agenda").value.split("\n").map((z) => z.trim()).filter(Boolean),
    teilnehmer: [...document.querySelectorAll(".tn-zeile")].map((z) => ({ name: z.children[0].value.trim(), rolle: z.children[1].value.trim() })).filter((t) => t.name),
  };
  const id = aktuell ? (await sende(`/api/workshops/${aktuell.id}`, daten, "PUT"), aktuell.id) : (await sende("/api/workshops", daten)).id;
  await lade(id);
}
$("#ws-speichern").addEventListener("click", versuche(async () => {
  if (!$("#ws-formular").reportValidity()) return;
  await speichereWorkshop();
  melde("Gespeichert.");
}));
$("#ws-formular").addEventListener("submit", versuche(async () => {
  await speichereWorkshop();
  bereich = "material";
  merke("broki-ws-bereich", bereich);
  zeige();
  document.querySelector(".inhalt").scrollTop = 0;
}));
// Material → Weiter: zum Meeting Assistenten des Workshops
$("#mat-weiter").addEventListener("click", versuche(() => oeffne("assistent")));
$("#ws-loeschen").addEventListener("click", versuche(async () => {
  if (!confirm(`Den Workshop „${aktuell.name}" mit seinem Material wirklich löschen? Das zugehörige Meeting bleibt im Archiv.`)) return;
  await sende(`/api/workshops/${aktuell.id}`, {}, "DELETE");
  try { sessionStorage.removeItem("broki-ws"); } catch {}
  await lade(null);
}));

// ── Material ──
function zeigeMaterial() {
  $("#mat-zahl").textContent = String(aktuell.material.length);
  const ziel = $("#mat-tabelle");
  if (!aktuell.material.length) {
    ziel.replaceChildren(el("p", "kasten-inhalt gedaempft", "Noch kein Material. Lade unten Interviews oder Dokumente als Markdown hoch."));
  } else {
    const t = el("table");
    const kopf = el("tr");
    kopf.append(...["Titel", "Art", "Von", "Umfang", "Eingegangen", ""].map((s) => { const th = el("th", "", s); th.scope = "col"; return th; }));
    const thead = el("thead");
    thead.append(kopf);
    const tbody = el("tbody");
    for (const m of aktuell.material) {
      const tr = el("tr");
      const aktionen = el("div", "reihe");
      const ansehen = knopf("Ansehen", "text", "zweit klein");
      ansehen.addEventListener("click", versuche(async () => {
        const voll = await hole(`/api/workshops/${aktuell.id}/material/${m.id}`);
        $("#mat-ansicht-titel").textContent = voll.titel;
        $("#mat-ansicht-text").textContent = voll.text;
        $("#mat-ansicht").showModal();
      }));
      const laden = el("a", "btn zweit klein");
      laden.href = `/api/workshops/${aktuell.id}/material/${m.id}?download`;
      laden.append(icon("download"), "Markdown");
      const weg = knopf("", "trash", "zweit klein");
      weg.setAttribute("aria-label", `„${m.titel}" löschen`);
      weg.addEventListener("click", versuche(async () => {
        if (!confirm(`„${m.titel}" wirklich löschen?`)) return;
        await sende(`/api/workshops/${aktuell.id}/material/${m.id}`, {}, "DELETE");
        await lade(aktuell.id);
      }));
      aktionen.append(ansehen, laden, weg);
      for (const zelle of [m.titel, el("span", `badge${m.art === "Interview" ? " arbeit" : ""}`, m.art), m.person || "–", `${m.zeichen.toLocaleString("de-DE")} Zeichen`, new Date(m.zeit).toLocaleDateString("de-DE"), aktionen]) {
        const td = el("td");
        td.append(zelle);
        tr.append(td);
      }
      tbody.append(tr);
    }
    t.append(thead, tbody);
    ziel.replaceChildren(t);
  }
  const person = $("#mat-person");
  const vorher = person.value;
  person.replaceChildren(option("", "–"), ...aktuell.teilnehmer.map((t) => option(t.name, t.rolle ? `${t.name} (${t.rolle})` : t.name)));
  person.value = [...person.options].some((o) => o.value === vorher) ? vorher : "";
  if (!wissenBearbeitet) {
    $("#wissen").value = aktuell.briefing;
    $("#wissen-begriffe").value = aktuell.begriffe;
  }
}
const zaehle = () => ($("#mat-zaehler").textContent = $("#mat-text").value.length ? `${$("#mat-text").value.length.toLocaleString("de-DE")} Zeichen` : "leer");
$("#mat-text").addEventListener("input", zaehle);
$("#mat-laden").addEventListener("click", () => $("#mat-datei").click());
// Dateien: jede wird ein eigener Eintrag, der Dateiname wird zum Titel.
$("#mat-datei").addEventListener("change", versuche(async () => {
  const dateien = [...$("#mat-datei").files];
  for (const d of dateien) {
    await sende(`/api/workshops/${aktuell.id}/material`, { titel: d.name.replace(/\.(md|txt|markdown)$/i, ""), art: $("#mat-art").value, person: $("#mat-person").value, text: await d.text() });
  }
  $("#mat-datei").value = "";
  await lade(aktuell.id);
  melde(`${dateien.length} Datei${dateien.length === 1 ? "" : "en"} gespeichert.`);
}));
$("#mat-formular").addEventListener("submit", versuche(async () => {
  await sende(`/api/workshops/${aktuell.id}/material`, { titel: $("#mat-titel").value, art: $("#mat-art").value, person: $("#mat-person").value, text: $("#mat-text").value });
  $("#mat-titel").value = $("#mat-text").value = "";
  zaehle();
  await lade(aktuell.id);
}));

// Wissen: Vorschlag der KI prüfen, dann übernehmen
let wissenBearbeitet = false;
for (const id of ["#wissen", "#wissen-begriffe"]) $(id).addEventListener("input", () => { wissenBearbeitet = true; $("#wissen-info").textContent = "Noch nicht übernommen"; });
$("#verdichten").addEventListener("click", versuche(async () => {
  if ($("#wissen").value.trim() && !confirm("Das bisherige Hintergrundwissen im Feld wird durch den neuen Vorschlag ersetzt. Fortfahren?")) return;
  $("#verdichten").disabled = true;
  $("#verdichten-info").textContent = "Die KI liest das Material …";
  try {
    const { wissen, begriffe } = await sende(`/api/workshops/${aktuell.id}/verdichten`);
    $("#wissen").value = wissen;
    if (begriffe) $("#wissen-begriffe").value = [...new Set([...$("#wissen-begriffe").value.split(","), ...begriffe.split(",")].map((b) => b.trim()).filter(Boolean))].join(", ");
    wissenBearbeitet = true;
    $("#verdichten-info").textContent = "Vorschlag steht unten. Bitte prüfen und übernehmen.";
    $("#wissen-info").textContent = "Noch nicht übernommen";
  } finally {
    $("#verdichten").disabled = false;
  }
}));
$("#wissen-speichern").addEventListener("click", versuche(async () => {
  await sende(`/api/workshops/${aktuell.id}/wissen`, { briefing: $("#wissen").value, begriffe: $("#wissen-begriffe").value }, "PUT");
  wissenBearbeitet = false;
  await lade(aktuell.id);
  $("#wissen-info").textContent = `Übernommen um ${new Date().toLocaleTimeString("de-DE")}. Die Agenten nutzen es ab der nächsten Frage.`;
}));

// ── Abhalten: Meeting Assistent und Agenten des Workshops öffnen ──
async function oeffne(ziel) {
  if (!aktuell.meetingVorhanden) throw new Error("Das Meeting dieses Workshops wurde gelöscht.");
  if (stand?.tag?.id !== aktuell.meetingId) {
    if (stand?.status.aufnahme) throw new Error("In einem anderen Meeting läuft gerade die Aufnahme. Bitte dort erst pausieren.");
    await sende(`/api/tage/${aktuell.meetingId}/aktivieren`);
  }
  gehe(ziel);
}
function zeigeAbhaltenWs() {
  const ziel = $("#ws-abhalten");
  if (!aktuell) return void ziel.replaceChildren();
  const feld = (text, iconName, zielBereich) => {
    const k = el("button", "select-item");
    k.type = "button";
    k.append(icon(iconName), el("span", "", text));
    k.addEventListener("click", versuche(() => oeffne(zielBereich)));
    return k;
  };
  ziel.replaceChildren(el("h2", "", "Abhalten"), feld("Meeting Assistent", "mic", "assistent"), feld("Agenten", "users", "agenten"));
}

// Dialog zum Ansehen eines Materials
const dialog = el("dialog");
dialog.id = "mat-ansicht";
dialog.className = "breit";
const dForm = el("form");
dForm.method = "dialog";
const dTitel = el("h2");
dTitel.id = "mat-ansicht-titel";
const dText = el("pre", "vorschau");
dText.id = "mat-ansicht-text";
const dZu = knopf("Schließen", "x", "zweit");
dZu.type = "submit";
const dReihe = el("div", "reihe");
dReihe.append(dZu);
dForm.append(dTitel, dText, dReihe);
dialog.append(dForm);
document.body.append(dialog);

beschrifte("#tn-neu", "plus", "Teilnehmer hinzufügen");
beschrifte("#ws-loeschen", "trash", "Löschen");
$("#ws-loeschen").title = "Workshop löschen";
beschrifte("#mat-weiter", "pfeil", "Weiter zum Meeting Assistenten");
beschrifte("#mat-laden", "plus", "Markdown-Dateien laden");
beschrifte("#mat-speichern", "plus", "Material speichern");
beschrifte("#verdichten", "regler", "Aus Material verdichten");
beschrifte("#wissen-speichern", "check", "Als Wissen übernehmen");

await lade();
verbinde((daten) => {
  stand = daten;
});
