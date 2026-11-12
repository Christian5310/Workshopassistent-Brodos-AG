import { el, sende, verbinde, ROLLEN } from "./common.js";

const $ = (id) => document.querySelector(id);
const datum = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("de-DE", { dateStyle: "medium" });
const uhr = (zeit) => new Date(zeit).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
const hole = async (pfad) => (await fetch(pfad)).json();
let gewaehlt = null;

verbinde(() => ladeListe()); // hält Zahlen und Namen aktuell, auch während eine Aufnahme läuft

async function ladeListe() {
  const tage = await hole("/api/tage");
  const liste = $("#eintraege");
  liste.replaceChildren();
  for (const t of tage) {
    const knopf = el("button", `zweit${t.id === gewaehlt ? " gewaehlt" : ""}`);
    knopf.append(el("b", "", `${t.name}${t.aktiv ? " (aktiv)" : ""}`), el("span", "", `${datum(t.datum)} · ${t.todos} To-dos · ${t.fragen} Fragen · ${t.abschnitte} Transkript-Abschnitte`));
    knopf.addEventListener("click", () => zeige(t.id));
    const li = el("li");
    li.append(knopf);
    liste.append(li);
  }
}

function abschnitt(titel, inhalt) {
  const s = el("section", "teil");
  s.append(el("h3", "", titel), inhalt);
  return s;
}

/** Zusammenfassung (einfaches Markdown: Überschriften und Listen) als DOM – ohne innerHTML. */
function zusammenfassung(markdown) {
  const rahmen = el("div", "zusammenfassung");
  let liste = null;
  for (const zeile of markdown.split("\n")) {
    if (zeile.startsWith("## ")) {
      rahmen.append(el("h4", "", zeile.slice(3)));
      liste = null;
    } else if (zeile.startsWith("- ")) {
      if (!liste) rahmen.append((liste = el("ul")));
      const erledigt = zeile.startsWith("- [x] ");
      liste.append(el("li", erledigt ? "erledigt" : "", zeile.replace(/^- (\[[ x]\] )?/, erledigt ? "✓ " : "")));
    }
  }
  return rahmen;
}

function link(text, href, klasse = "knopf") {
  const a = el("a", klasse, text);
  a.href = href;
  return a;
}

async function zeige(id) {
  gewaehlt = id;
  const t = await hole(`/api/tage/${id}`);
  const detail = $("#detail");
  detail.replaceChildren();
  if (t.fehler) return void detail.append(el("p", "", t.fehler));

  const kopf = el("div", "detailkopf");
  const titel = el("div");
  titel.append(el("h2", "", t.name), el("p", "", `${datum(t.datum)}${t.aktiv ? " · aktiver Tag" : ""}`));

  const broki = el("button", "", "Für Broki kopieren");
  broki.title = "Kopiert Zusammenfassungs-Prompt, Protokoll und Transkript in die Zwischenablage";
  broki.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(await (await fetch(`/api/tage/${id}/broki`)).text());
      broki.textContent = "Kopiert ✓ – jetzt in Broki einfügen";
    } catch {
      window.open(`/api/tage/${id}/broki`, "_blank"); // Zwischenablage gesperrt: Text in neuem Tab zum Kopieren
    }
  });
  const weg = el("button", "zweit", "Tag löschen");
  weg.addEventListener("click", async () => {
    if (!confirm(`„${t.name}" mit Transkript, To-dos und Fragen wirklich unwiderruflich löschen?`)) return;
    try {
      await sende(`/api/tage/${id}`, {}, "DELETE");
      gewaehlt = null;
      detail.replaceChildren(el("p", "", "Tag gelöscht."));
      ladeListe();
    } catch (fehler) {
      alert(fehler.message);
    }
  });
  const aktionen = el("div", "reihe");
  aktionen.append(link("Transkript herunterladen", `/api/tage/${id}/markdown?art=transkript`), link("Alles herunterladen", `/api/tage/${id}/markdown`), broki, weg);
  kopf.append(titel, aktionen);

  // Fragen und Antworten: jede Frage mit den Antworten, die darauf folgten
  const qa = el("div", "qa");
  let block = null;
  for (const n of t.chat) {
    if (n.von === "frage") {
      block = el("div", "qa-block");
      const an = n.an && n.an !== "alle" ? ROLLEN[n.an].name : "alle";
      block.append(el("p", "qa-frage", `${uhr(n.zeit)} · Frage an ${an}: ${n.text}`));
      qa.append(block);
    } else if (block) {
      const antwort = el("p", `qa-antwort ${n.von}`);
      antwort.append(el("b", "", `${ROLLEN[n.von].symbol} ${ROLLEN[n.von].name}: `), n.text);
      block.append(antwort);
    }
  }
  if (!t.chat.length) qa.append(el("p", "", "Keine Fragen gestellt."));

  // Transkript, gegliedert nach dem Agendapunkt, der beim Sprechen ausgewählt war
  const transkript = el("div", "transkript");
  let letzter = null;
  for (const a of t.transkript) {
    const punkt = t.protokoll.agenda.find((p) => p.id === a.agendapunkt)?.titel ?? "Ohne Agendapunkt";
    if (punkt !== letzter) transkript.append(el("h4", "", (letzter = punkt)));
    const p = el("div");
    p.append(el("time", "", uhr(a.zeit)), a.text);
    transkript.append(p);
  }
  if (!t.transkript.length) transkript.append(el("p", "", "Kein Transkript."));

  detail.append(kopf, abschnitt("Zusammenfassung", zusammenfassung(t.zusammenfassung)), abschnitt("Fragen und Antworten", qa), abschnitt("Transkript", transkript));
  ladeListe();
}

ladeListe();
