import fs from "node:fs";
import path from "node:path";
import { config } from "./config.ts";

/**
 * Hochgeladene Originaldateien des Workshop-Materials (PDF, Word, Excel, Text).
 * Die Datei bleibt zum Öffnen auf dem Laptop liegen; für Zusammenfassung, Merlin und Agenten wird der Text herausgelesen.
 * Ablage: data/workshops/dateien/<workshop-id>/<material-id>.<endung>
 */
export const ENDUNGEN = {
  pdf: { mime: "application/pdf", art: "PDF" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", art: "Word" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", art: "Excel" },
  md: { mime: "text/markdown; charset=utf-8", art: "Text" },
  markdown: { mime: "text/markdown; charset=utf-8", art: "Text" },
  txt: { mime: "text/plain; charset=utf-8", art: "Text" },
} as const;
export type Endung = keyof typeof ENDUNGEN;
export const istEndung = (e: string): e is Endung => e in ENDUNGEN;

/** Größte erlaubte Datei (Bytes) */
export const MAX_GROESSE = 25 * 1024 * 1024;

const basis = path.join(path.dirname(config.pfade.daten), "workshops", "dateien");
const gueltig = (id: string) => /^[\w-]+$/.test(id);

export function pfad(workshopId: string, materialId: string, endung: Endung): string | null {
  if (!gueltig(workshopId) || !gueltig(materialId)) return null;
  return path.join(basis, workshopId, `${materialId}.${endung}`);
}

export function speichere(workshopId: string, materialId: string, endung: Endung, inhalt: Buffer): void {
  const ziel = pfad(workshopId, materialId, endung);
  if (!ziel) throw new Error("Ungültige Kennung.");
  fs.mkdirSync(path.dirname(ziel), { recursive: true });
  fs.writeFileSync(ziel, inhalt);
}

export function loesche(workshopId: string, materialId: string, endung: Endung): void {
  const ziel = pfad(workshopId, materialId, endung);
  if (ziel) fs.rmSync(ziel, { force: true });
}

/** Alle Dateien eines Workshops entfernen (wenn der Workshop gelöscht wird). */
export function loescheAlle(workshopId: string): void {
  if (gueltig(workshopId)) fs.rmSync(path.join(basis, workshopId), { recursive: true, force: true });
}

/** Liest den Text aus einer Datei. Gescannte PDFs (nur Bilder) liefern leeren Text. */
export async function textAus(inhalt: Buffer, endung: Endung): Promise<string> {
  if (endung === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(inhalt));
    const { text } = await extractText(pdf, { mergePages: true });
    return aufraeumen(text);
  }
  if (endung === "docx") {
    const mammoth = (await import("mammoth")).default;
    const { value } = await mammoth.extractRawText({ buffer: inhalt });
    return aufraeumen(value);
  }
  if (endung === "xlsx") {
    const ExcelJS = (await import("exceljs")).default;
    const mappe = new ExcelJS.Workbook();
    await mappe.xlsx.load(inhalt as unknown as ArrayBuffer);
    const teile: string[] = [];
    mappe.eachSheet((blatt) => {
      const zeilen: string[] = [];
      blatt.eachRow({ includeEmpty: false }, (zeile) => {
        if (zeilen.length >= 2000) return; // sehr große Tabellen: der Anfang reicht für Überblick und Fragen
        const zellen = (zeile.values as unknown[]).slice(1).map((z) => zelltext(z));
        if (zellen.some(Boolean)) zeilen.push(zellen.join(" | "));
      });
      if (zeilen.length) teile.push(`## Tabellenblatt: ${blatt.name}\n${zeilen.join("\n")}`);
    });
    return teile.join("\n\n");
  }
  return aufraeumen(inhalt.toString("utf8"));
}

function zelltext(z: unknown): string {
  if (z === null || z === undefined) return "";
  if (z instanceof Date) return z.toLocaleDateString("de-DE");
  if (typeof z === "object") {
    const o = z as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((r) => r.text).join("");
    if (o.text !== undefined) return String(o.text);
    if (o.result !== undefined) return zelltext(o.result);
    return "";
  }
  return String(z).trim();
}

const aufraeumen = (t: string) => t.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
