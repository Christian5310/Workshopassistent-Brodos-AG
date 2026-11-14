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
      ` Die Aufnahme lässt sich jederzeit pausieren. Wer nicht aufgezeichnet werden möchte, sagt das bitte gleich.`,
    agenda: agenda.length
      ? `Das ist die Agenda für heute. ${agenda.map((a, i) => `${["Erstens", "Zweitens", "Drittens", "Viertens", "Fünftens", "Sechstens", "Siebtens", "Achtens"][i] ?? "Dann"}: ${a}.`).join(" ")} Dann legen wir los.`
      : `Für heute ist noch keine Agenda hinterlegt. Dann legen wir los.`,
  };
}

export const OHNE_MATERIAL = "Zur Vorbereitung wurde noch nichts eingereicht. Wir starten also mit dem, was ihr heute mitbringt.";
