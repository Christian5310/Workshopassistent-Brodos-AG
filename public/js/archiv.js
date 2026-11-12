import { el, sende, verbinde, ROLLEN } from "./common.js";

const $ = (id) => document.querySelector(id);
const datum = (zeit) => new Date(zeit).toLocaleString("de-DE", { dateStyle: "medium", timeStyle: "short" });
const uhr = (zeit) => new Date(zeit).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
let gewaehlt = null;

const melde = (text) => ($("#meldung").textContent = text);
const hole = async (pfad) => (await fetch(pfad)).json();

// Aktuelle Sitzung: zeigt live, was beim Speichern im Archiv landen würde.
verbinde(({ protokoll, chat }) => {
  const fragen = chat.filter((n) => n.von === "frage").length;
  $("#aktuell-info").textContent = `Laufende Sitzung: ${protokoll.todos.length} To-dos, ${protokoll.entscheidungen.length} Entscheidungen, ${fragen} Fragen an die Spezial-Agenten.`;
});

async function ladeListe() {
  const eintraege = await hole("/api/archiv");
  const liste = $("#eintraege");
  liste.replaceChildren();
  if (!eintraege.length) liste.append(el("li", "leer", "Noch nichts gespeichert."));
  for (const e of eintraege) {
    const knopf = el("button", `zweit${e.id === gewaehlt ? " gewaehlt" : ""}`);
    knopf.append(el("b", "", e.titel), el("span", "", `${datum(e.zeit)} · ${e.todos} To-dos · ${e.fragen} Fragen · ${e.abschnitte} Transkript-Abschnitte`));
    knopf.addEventListener("click", () => zeige(e.id));
    const li = el("li");
    li.append(knopf);
    liste.append(li);
  }
  $("#alles-loeschen").hidden = !eintraege.length;
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

async function zeige(id) {
  gewaehlt = id;
  const e = await hole(`/api/archiv/${id}`);
  const detail = $("#detail");
  detail.replaceChildren();
  if (e.fehler) return void detail.append(el("p", "", e.fehler));

  const kopf = el("div", "detailkopf");
  const titel = el("div");
  titel.append(el("h2", "", e.titel), el("p", "", `Gespeichert am ${datum(e.zeit)}`));
  const herunter = el("a", "knopf", "Als Markdown herunterladen");
  herunter.href = `/api/archiv/${id}/markdown`;
  const weg = el("button", "zweit", "Eintrag löschen");
  weg.addEventListener("click", async () => {
    if (!confirm(`„${e.titel}" wirklich unwiderruflich löschen?`)) return;
    await sende(`/api/archiv/${id}`, {}, "DELETE");
    gewaehlt = null;
    detail.replaceChildren(el("p", "", "Eintrag gelöscht."));
    ladeListe();
  });
  const broki = el("button", "", "Für Broki kopieren");
  broki.title = "Kopiert Zusammenfassungs-Prompt, Protokoll und Transkript in die Zwischenablage";
  broki.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(await (await fetch(`/api/archiv/${id}/broki`)).text());
      broki.textContent = "Kopiert ✓ – jetzt in Broki einfügen";
    } catch {
      window.open(`/api/archiv/${id}/broki`, "_blank"); // Zwischenablage gesperrt: Text in neuem Tab zum Kopieren
    }
  });
  const aktionen = el("div", "reihe");
  aktionen.append(broki, herunter, weg);
  kopf.append(titel, aktionen);

  // Fragen und Antworten: jede Frage mit den Antworten, die darauf folgten
  const qa = el("div", "qa");
  let block = null;
  for (const n of e.chat) {
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
  if (!e.chat.length) qa.append(el("p", "", "Keine Fragen gestellt."));

  const transkript = el("div", "transkript");
  for (const t of e.transkript) {
    const p = el("div");
    p.append(el("time", "", uhr(t.zeit)), t.text);
    transkript.append(p);
  }
  if (!e.transkript.length) transkript.append(el("p", "", "Kein Transkript."));

  detail.append(kopf, abschnitt("Zusammenfassung", zusammenfassung(e.zusammenfassung)), abschnitt("Fragen und Antworten", qa), abschnitt("Transkript", transkript));
  ladeListe();
}

$("#speichern").addEventListener("submit", async (ereignis) => {
  ereignis.preventDefault();
  try {
    const { id } = await sende("/api/archiv", { titel: $("#titel").value });
    $("#titel").value = "";
    melde("Gespeichert.");
    await zeige(id);
  } catch (fehler) {
    melde(fehler.message);
  }
});

$("#alles-loeschen").addEventListener("click", async () => {
  if (!confirm("Das ganze Archiv wirklich unwiderruflich löschen?")) return;
  await sende("/api/archiv", {}, "DELETE");
  gewaehlt = null;
  $("#detail").replaceChildren(el("p", "", "Archiv gelöscht."));
  ladeListe();
});

ladeListe();
