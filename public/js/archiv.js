import { agentName, el, gehe, icon, imRahmen, knopf, sende, verbinde } from "./common.js";

imRahmen("archiv");
const $ = (id) => document.querySelector(id);
const datum = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("de-DE", { dateStyle: "medium" });
const uhr = (zeit) => new Date(zeit).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const hole = async (pfad) => (await fetch(pfad)).json();
let gewaehlt = null;

verbinde(() => ladeListe()); // hält Zahlen und Namen aktuell, auch während eine Aufnahme läuft

async function ladeListe() {
  const meetings = await hole("/api/tage");
  const liste = $("#eintraege");
  liste.replaceChildren();
  const gruppe = (titel, eintraege, leer) => {
    liste.append(el("h2", "", titel));
    if (!eintraege.length) liste.append(el("p", "hilfe", leer));
    for (const m of eintraege) {
      const k = el("button", `select-item${m.id === gewaehlt ? " is-active" : ""}`);
      k.type = "button";
      const text = el("span");
      text.append(m.name, el("span", "zusatz", `${datum(m.datum)} · ${m.todos} To-dos${m.aktiv ? " · geöffnet" : ""}`));
      k.append(icon(m.abgeschlossen ? "archive" : "kalender"), text);
      k.addEventListener("click", () => zeige(m.id));
      liste.append(k);
    }
  };
  gruppe("Abgeschlossen", meetings.filter((m) => m.abgeschlossen), "Noch kein abgeschlossenes Meeting.");
  const offen = meetings.filter((m) => !m.abgeschlossen);
  if (offen.length) gruppe("Noch nicht abgeschlossen", offen, "");
  if (!gewaehlt) zeigeLeer();
}

function zeigeLeer(text = "Wähle links ein Meeting aus.") {
  const kreis = el("span", "kreis");
  kreis.append(icon("archive"));
  const leer = el("div", "leerzustand");
  leer.append(kreis, el("p", "", text));
  const kopf = el("div", "seitenkopf");
  const titel = el("div");
  titel.append(el("h1", "", "Archiv"), el("p", "unterzeile", `Nach „Meeting schließen" liegt hier alles ab: To-dos, Entscheidungen, Fragen und Transkript.`));
  kopf.append(titel);
  $("#detail").replaceChildren(kopf, leer);
}

function download(text, href, klasse = "btn zweit klein") {
  const a = el("a", klasse);
  a.href = href;
  a.append(icon("download"), text);
  return a;
}

/** Kasten mit Titel, Anzahl und Download-Knöpfen rechts. */
function kasten(titel, anzahl, downloads, inhalt) {
  const s = el("section", "kasten");
  const kopf = el("div", "kasten-kopf");
  const h = el("h2", "", titel);
  const links = el("div", "reihe");
  links.append(h);
  if (anzahl !== null) links.append(el("span", "badge", String(anzahl)));
  const knoepfe = el("div", "reihe");
  knoepfe.append(...downloads);
  kopf.append(links, knoepfe);
  s.append(kopf, inhalt);
  return s;
}

function tabelle(spalten, zeilen, leer) {
  const rahmen = el("div", "tabellenrahmen");
  if (!zeilen.length) {
    rahmen.append(el("p", "kasten-inhalt gedaempft", leer));
    return rahmen;
  }
  const t = el("table");
  const kopf = el("tr");
  kopf.append(...spalten.map((s) => { const th = el("th", "", s); th.scope = "col"; return th; }));
  const thead = el("thead");
  thead.append(kopf);
  const tbody = el("tbody");
  for (const z of zeilen) {
    const tr = el("tr");
    tr.append(...z.map((zelle) => { const td = el("td"); td.append(zelle); return td; }));
    tbody.append(tr);
  }
  t.append(thead, tbody);
  rahmen.append(t);
  return rahmen;
}

const badge = (text, klasse = "") => el("span", `badge ${klasse}`.trim(), text);

async function zeige(id) {
  gewaehlt = id;
  const m = await hole(`/api/tage/${id}`);
  const detail = $("#detail");
  if (m.fehler) return void zeigeLeer(m.fehler);
  const p = m.protokoll;
  const punkt = (pid) => p.agenda.find((a) => a.id === pid)?.titel ?? "Ohne Agendapunkt";
  const reihenfolge = (pid) => { const i = p.agenda.findIndex((a) => a.id === pid); return i < 0 ? 999 : i; };
  const md = (art) => `/api/tage/${id}/markdown?art=${art}`;

  // Kopf: Name, Zustand, Aktionen (Primär ganz rechts)
  const kopf = el("div", "seitenkopf");
  const titel = el("div");
  const zustand = m.abgeschlossen ? `abgeschlossen am ${new Date(m.geschlossenAm).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}` : m.aktiv ? "gerade geöffnet" : "noch nicht abgeschlossen";
  titel.append(el("h1", "", m.name), el("p", "unterzeile", `${datum(m.datum)} · ${zustand}`));
  const aktionen = el("div", "aktionen");
  const weg = knopf("Löschen", "trash", "zweit");
  weg.addEventListener("click", async () => {
    if (!confirm(`„${m.name}" mit Transkript, To-dos und Fragen wirklich unwiderruflich löschen?`)) return;
    try {
      await sende(`/api/tage/${id}`, {}, "DELETE");
      gewaehlt = null;
      ladeListe();
    } catch (fehler) {
      alert(fehler.message);
    }
  });
  aktionen.append(weg);
  if (m.abgeschlossen) {
    const wieder = knopf("Wieder öffnen", "undo", "zweit");
    wieder.title = "Öffnet das Meeting erneut im Transkriptions-Assistenten";
    wieder.addEventListener("click", async () => {
      try {
        await sende(`/api/tage/${id}/aktivieren`);
        gehe("assistent");
      } catch (fehler) {
        alert(fehler.message);
      }
    });
    aktionen.append(wieder);
  }
  const broki = knopf("Für Broki kopieren", "kopieren", "zweit");
  broki.title = "Kopiert Zusammenfassungs-Prompt, Protokoll und Transkript in die Zwischenablage";
  broki.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(await (await fetch(`/api/tage/${id}/broki`)).text());
      broki.replaceChildren(icon("check"), "Kopiert – jetzt in Broki einfügen");
    } catch {
      window.open(`/api/tage/${id}/broki`, "_blank"); // Zwischenablage gesperrt: Text in neuem Tab zum Kopieren
    }
  });
  aktionen.append(broki, download("Alles herunterladen", md("alles"), "btn"));
  kopf.append(titel, aktionen);

  // Nachweis des bestätigten Einverständnisses
  const nachweis = el("div", "hinweisband");
  const e = m.einwilligungen ?? [];
  const zeit = (z) => new Date(z).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
  nachweis.append(icon(e.length ? "check" : "info"), e.length ? `Einverständnis der Teilnehmenden bestätigt: ${[...new Set(e.map((x) => zeit(x.bestaetigtUm)))].join(" · ")}` : "Für dieses Meeting ist kein Einverständnis dokumentiert.");

  // Kennzahlen
  const kennzahlen = el("div", "kennzahlen");
  for (const [bez, wert] of [["To-dos", p.todos.length], ["davon offen", p.todos.filter((t) => t.status === "offen").length], ["Entscheidungen", p.entscheidungen.length], ["Fragen an Agenten", m.chat.filter((n) => n.von === "frage").length]]) {
    const k = el("div", "kennzahl");
    k.append(el("div", "bezeichnung", bez), el("div", "wert", String(wert)));
    kennzahlen.append(k);
  }

  // To-dos als Tabelle, sortiert nach Agendapunkt
  const todos = [...p.todos].sort((a, b) => reihenfolge(a.agendapunkt) - reihenfolge(b.agendapunkt));
  const todoTabelle = tabelle(
    ["Agendapunkt", "To-do", "Wer", "Bis", "Status"],
    todos.map((t) => [el("span", "gedaempft", punkt(t.agendapunkt)), t.text, t.owner, t.frist, badge(t.status === "erledigt" ? "Erledigt" : "Offen", t.status === "erledigt" ? "erledigt" : "")]),
    "Keine To-dos.",
  );

  const entscheidungen = tabelle(
    ["Agendapunkt", "Entscheidung"],
    [...p.entscheidungen].sort((a, b) => reihenfolge(a.agendapunkt) - reihenfolge(b.agendapunkt)).map((e) => [el("span", "gedaempft", punkt(e.agendapunkt)), e.text]),
    "Keine Entscheidungen.",
  );
  const fragen = tabelle(["Offene Frage", "Status"], p.offene_fragen.map((f) => [f.text, badge(f.status === "beantwortet" ? "Beantwortet" : "Offen", f.status === "beantwortet" ? "erledigt" : "")]), "Keine offenen Fragen.");

  // Fragen an die Agenten: jede Frage mit den Antworten, die darauf folgten
  const qa = el("div", "qa kasten-inhalt");
  let block = null;
  for (const n of m.chat) {
    if (n.von === "frage") {
      block = el("div", "qa-block");
      block.append(el("p", "qa-frage", `${uhr(n.zeit)} · Frage an ${n.an && n.an !== "alle" ? agentName(n.an) : "alle"}: ${n.text}`));
      qa.append(block);
    } else if (block) {
      const antwort = el("p", "qa-antwort");
      antwort.append(el("b", "", `${n.name ?? agentName(n.von)}: `), n.text);
      block.append(antwort);
    }
  }
  if (!m.chat.length) qa.append(el("p", "gedaempft", "Keine Fragen gestellt."));

  // Transkript, gegliedert nach dem Agendapunkt, der beim Sprechen ausgewählt war
  const transkript = el("div", "transkript");
  let letzter = null;
  for (const a of m.transkript) {
    if (punkt(a.agendapunkt) !== letzter) transkript.append(el("h4", "", (letzter = punkt(a.agendapunkt))));
    const zeile = el("div");
    zeile.append(el("time", "", uhr(a.zeit)), a.text);
    transkript.append(zeile);
  }
  if (!m.transkript.length) transkript.append(el("p", "gedaempft", "Kein Transkript."));
  const aufklapp = el("details", "kasten-inhalt");
  aufklapp.append(el("summary", "", `Transkript anzeigen (${m.transkript.length} Abschnitte)`), transkript);

  detail.replaceChildren(
    kopf,
    nachweis,
    kennzahlen,
    kasten("To-do-Liste", p.todos.length, [download("Markdown", md("todos")), download("Excel (CSV)", `/api/tage/${id}/todos.csv`)], todoTabelle),
    kasten("Entscheidungen", p.entscheidungen.length, [download("Markdown", md("entscheidungen"))], entscheidungen),
    kasten("Offene Fragen", p.offene_fragen.length, [], fragen),
    kasten("Fragen an die Spezial-Agenten", m.chat.filter((n) => n.von === "frage").length, [download("Markdown", md("fragen"))], qa),
    kasten("Transkript", null, [download("Markdown", md("transkript"))], aufklapp),
  );
  detail.scrollTop = 0;
  ladeListe();
}

ladeListe();
