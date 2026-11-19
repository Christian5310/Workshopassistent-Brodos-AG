import { einstellungen } from "./einstellungen.ts";
import type { Tag } from "./store.ts";
import type { Workshop } from "./workshops.ts";

/**
 * Ansagen: was Merlin zur Einstimmung vorliest (Bubble im Meeting Assistenten).
 * Vier Stationen. Begrüßung, Regeln und Agenda entstehen aus festen Bausteinen, damit sie verlässlich stimmen;
 * nur die Zusammenfassung des Eingereichten formuliert das Sprachmodell.
 */
export const STATIONEN = ["begruessung", "eingereicht", "regeln", "agenda"] as const;
export type Ansagen = Record<(typeof STATIONEN)[number], string>;

const aufzaehlung = (teile: string[]) => (teile.length <= 1 ? teile.join("") : `${teile.slice(0, -1).join(", ")} und ${teile.at(-1)}`);

export function vorlage(tag: Tag, workshop: Workshop | null, eingereicht: string): Ansagen {
  const wort = einstellungen.aktivierungswort;
  const namen = workshop?.teilnehmer.map((t) => t.name.split(/\s+/)[0]!).filter(Boolean) ?? [];
  const agenda = tag.protokoll.agenda.map((a) => a.titel);
  return {
    begruessung:
      `Herzlich willkommen${workshop ? ` zum ${tag.name}` : ` zum Meeting ${tag.name}`}.` +
      (namen.length ? ` Schön, dass ihr da seid: ${aufzaehlung(namen)}.` : "") +
      ` Ich bin ${wort}, euer Meeting Assistent. Ich höre heute mit, schreibe das Transkript und führe die To-do-Liste.` +
      ` Für Fachfragen sind die Agenten da.`,
    eingereicht,
    regeln:
      `Ein paar Regeln für heute. Das Gespräch wird aufgezeichnet und in Text umgewandelt. Ich erkenne dabei nicht, wer spricht.` +
      ` Damit ein To-do bei der richtigen Person landet, nennt bitte Name und Frist. Zum Beispiel: ${wort}, To-do für Anna: Zahlen bis Freitag liefern.` +
      ` Bin ich unsicher, lege ich einen Vorschlag an, den ihr übernehmt oder verwerft.` +
      ` Wenn ihr mich anklickt, reagiere ich sofort: Ich wechsle die Ansicht, starte oder pausiere die Aufnahme oder lese etwas vor. Was ihr ohne Klick zu mir sagt, landet nur im Protokoll.` +
      ` Die Aufnahme lässt sich jederzeit pausieren. Wer nicht aufgezeichnet werden möchte, sagt das bitte gleich.`,
    agenda: agendaText(agenda),
  };
}

/** Vorlesetext der Agenda. Wird bei jedem Abruf neu gebildet, damit spätere Änderungen an der Agenda drin sind. */
export function agendaText(agenda: string[]): string {
  if (!agenda.length) return "Für heute ist noch keine Agenda hinterlegt.";
  const zaehler = ["Erstens", "Zweitens", "Drittens", "Viertens", "Fünftens", "Sechstens", "Siebtens", "Achtens", "Neuntens", "Zehntens"];
  return `Sehr gerne. Hier sind die Agendapunkte: ${agenda.map((a, i) => `${zaehler[i] ?? "Dann"}: ${a}.`).join(" ")}`;
}

export const OHNE_MATERIAL = "Zur Vorbereitung wurde noch nichts eingereicht. Wir starten also mit dem, was ihr heute mitbringt.";
