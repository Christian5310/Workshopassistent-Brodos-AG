import { agentName, el, sende, verbinde } from "./common.js";

const $ = (id) => document.querySelector(id);
const datum = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("de-DE", { dateStyle: "long" });
const uhr = (zeit) => new Date(zeit).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const hole = async (pfad) => (await fetch(pfad)).json();
let gewaehlt = null;

verbinde(() => ladeListe()); // hält Zahlen und Namen aktuell, auch während eine Aufnahme läuft

async function ladeListe() {
  const meetings = await hole("/api/tage");
  const liste = $("#eintraege");
  liste.replaceChildren();
  const gruppe = (titel, eintraege, leer) => {
    liste.append(el("li", "gruppentitel", titel));
    if (!eintraege.length) liste.append(el("li", "leer", leer));
    for (const m of eintraege) {
      const knopf = el("button", `zweit${m.id === gewaehlt ? " gewaehlt" : ""}`);
      knopf.append(el("b", "", `${m.name}${m.aktiv ? " (geöffnet)" : ""}`), el("span", "", `${datum(m.datum)} · ${m.todos} To-dos · ${m.entscheidungen} Entscheidungen · ${m.fragen} Fragen`));
      knopf.addEventListener("click", () => zeige(m.id));
      const li = el("li");
      li.append(knopf);
      liste.append(li);
    }
  };
  gruppe("Abgeschlossen", meetings.filter((m) => m.abgeschlossen), "Noch kein abgeschlossenes Meeting.");
  const offen = meetings.filter((m) => !m.abgeschlossen);
  if (offen.length) gruppe("Noch nicht abgeschlossen", offen, "");
}

function download(text, href, klasse = "knopf klein") {
  const a = el("a", klasse, `↓ ${text}`);
  a.href = href;
  return a;
}

/** Ein Abschnitt des Meetings: Überschrift, Anzahl, Download-Knöpfe rechts, darunter der Inhalt. */
function abschnitt(titel, anzahl, downloads, inhalt) {
  const s = el("section", "block teil");
  const kopf = el("div", "teilkopf");
  const h = el("h3", "", titel);
  if (anzahl !== null) h.append(el("span", "zahl", String(anzahl)));
  const knoepfe = el("div", "reihe");
  knoepfe.append(...downloads);
  kopf.append(h, knoepfe);
  s.append(kopf, inhalt);
  return s;
}

/** Gruppiert nach Agendapunkt in der Reihenfolge der Agenda; ohne Zuordnung zuletzt. */
function nachAgendapunkt(agenda, eintraege) {
  const gruppen = agenda.map((a) => ({ titel: a.titel, eintraege: eintraege.filter((e) => e.agendapunkt === a.id) }));
  const ohne = eintraege.filter((e) => !agenda.some((a) => a.id === e.agendapunkt));
  return [...gruppen, { titel: "Ohne Agendapunkt", eintraege: ohne }].filter((g) => g.eintraege.length);
}

function gruppiert(agenda, eintraege, zeile, leer) {
  const rahmen = el("div", "gruppiert");
  for (const g of nachAgendapunkt(agenda, eintraege)) {
    const liste = el("ul");
    liste.append(...g.eintraege.map(zeile));
    rahmen.append(el("h4", "", g.titel), liste);
  }
  if (!eintraege.length) rahmen.append(el("p", "leer", leer));
  return rahmen;
}

async function zeige(id) {
  gewaehlt = id;
  const m = await hole(`/api/tage/${id}`);
  const detail = $("#detail");
  detail.replaceChildren();
  if (m.fehler) return void detail.append(el("p", "", m.fehler));
  const p = m.protokoll;
  const md = (art) => `/api/tage/${id}/markdown?art=${art}`;

  // Kopf: Name, Datum, Gesamt-Download, Broki, Löschen
  const kopf = el("div", "block detailkopf");
  const titel = el("div");
  const zustand = m.abgeschlossen ? `abgeschlossen am ${new Date(m.geschlossenAm).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" })}` : m.aktiv ? "gerade geöffnet" : "noch nicht abgeschlossen";
  titel.append(el("h2", "", m.name), el("p", "", `${datum(m.datum)} · ${zustand}`));
  const broki = el("button", "zweit", "Für Broki kopieren");
  broki.title = "Kopiert Zusammenfassungs-Prompt, Protokoll und Transkript in die Zwischenablage";
  broki.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(await (await fetch(`/api/tage/${id}/broki`)).text());
      broki.textContent = "Kopiert ✓ – jetzt in Broki einfügen";
    } catch {
      window.open(`/api/tage/${id}/broki`, "_blank"); // Zwischenablage gesperrt: Text in neuem Tab zum Kopieren
    }
  });
  const weg = el("button", "zweit", "Meeting löschen");
  weg.addEventListener("click", async () => {
    if (!confirm(`„${m.name}" mit Transkript, To-dos und Fragen wirklich unwiderruflich löschen?`)) return;
    try {
      await sende(`/api/tage/${id}`, {}, "DELETE");
      gewaehlt = null;
      detail.replaceChildren(el("div", "block", "Meeting gelöscht."));
      ladeListe();
    } catch (fehler) {
      alert(fehler.message);
    }
  });
  const aktionen = el("div", "reihe");
  aktionen.append(download("Alles herunterladen", md("alles"), "knopf"), broki);
  if (m.abgeschlossen) {
    const wieder = el("button", "zweit", "Wieder öffnen");
    wieder.title = "Öffnet das Meeting erneut im Transkriptions-Assistenten";
    wieder.addEventListener("click", async () => {
      try {
        await sende(`/api/tage/${id}/aktivieren`);
        location.href = "/screen1";
      } catch (fehler) {
        alert(fehler.message);
      }
    });
    aktionen.append(wieder);
  }
  aktionen.append(weg);
  kopf.append(titel, aktionen);

  // To-dos, gegliedert nach Agendapunkt
  const todos = gruppiert(p.agenda, p.todos, (t) => {
    const li = el("li", t.status === "erledigt" ? "erledigt" : "");
    li.append(el("span", "haken", t.status === "erledigt" ? "✓" : "○"), el("span", "", t.text), el("span", "meta", `Wer: ${t.owner} · Bis: ${t.frist}`));
    return li;
  }, "Keine To-dos.");
  const offen = p.todos.filter((t) => t.status === "offen").length;

  const entscheidungen = gruppiert(p.agenda, p.entscheidungen, (e) => { const li = el("li"); li.append(el("span", "haken", "→"), el("span", "", e.text)); return li; }, "Keine Entscheidungen.");
  if (p.offene_fragen.length) {
    const liste = el("ul");
    liste.append(...p.offene_fragen.map((f) => { const li = el("li", f.status === "beantwortet" ? "erledigt" : ""); li.append(el("span", "haken", f.status === "beantwortet" ? "✓" : "?"), el("span", "", f.text)); return li; }));
    entscheidungen.append(el("h4", "", "Offene Fragen"), liste);
  }

  // Fragen und Antworten: jede Frage mit den Antworten, die darauf folgten
  const qa = el("div", "qa");
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
  if (!m.chat.length) qa.append(el("p", "leer", "Keine Fragen gestellt."));

  // Transkript, gegliedert nach dem Agendapunkt, der beim Sprechen ausgewählt war
  const transkript = el("div", "transkript");
  let letzter = null;
  for (const a of m.transkript) {
    const punkt = p.agenda.find((x) => x.id === a.agendapunkt)?.titel ?? "Ohne Agendapunkt";
    if (punkt !== letzter) transkript.append(el("h4", "", (letzter = punkt)));
    const zeile = el("div");
    zeile.append(el("time", "", uhr(a.zeit)), a.text);
    transkript.append(zeile);
  }
  if (!m.transkript.length) transkript.append(el("p", "leer", "Kein Transkript."));
  const transkriptRahmen = el("details", "aufklapp");
  transkriptRahmen.append(el("summary", "", `Transkript anzeigen (${m.transkript.length} Abschnitte)`), transkript);

  detail.append(
    kopf,
    abschnitt("To-do-Liste", `${p.todos.length} · ${offen} offen`, [download("Markdown", md("todos")), download("Excel (CSV)", `/api/tage/${id}/todos.csv`)], todos),
    abschnitt("Entscheidungen und offene Fragen", p.entscheidungen.length, [download("Markdown", md("entscheidungen"))], entscheidungen),
    abschnitt("Fragen an die Spezial-Agenten", m.chat.filter((n) => n.von === "frage").length, [download("Markdown", md("fragen"))], qa),
    abschnitt("Transkript", null, [download("Markdown", md("transkript"))], transkriptRahmen),
  );
  ladeListe();
}

ladeListe();
