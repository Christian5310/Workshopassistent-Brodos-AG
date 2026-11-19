// Ausführen: npm.cmd test
// Prüft, ob aus hochgeladenen Dateien der Text für Pinnwand, Merlin und Agenten gelesen wird.
import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { istEndung, textAus } from "../src/dateien.ts";

test("Erlaubte Endungen", () => {
  for (const e of ["pdf", "docx", "xlsx", "md", "txt"]) assert.ok(istEndung(e), e);
  for (const e of ["exe", "doc", "xls", "js"]) assert.ok(!istEndung(e), e);
});

test("Excel: jedes Tabellenblatt als Tabelle", async () => {
  const mappe = new ExcelJS.Workbook();
  const ideen = mappe.addWorksheet("Ideen");
  ideen.addRow(["Idee", "Nutzen"]);
  ideen.addRow(["Angebote per KI", "schneller"]);
  mappe.addWorksheet("Leer");
  const puffer = Buffer.from(await mappe.xlsx.writeBuffer());
  const text = await textAus(puffer, "xlsx");
  assert.match(text, /## Tabellenblatt: Ideen/);
  assert.match(text, /Angebote per KI \| schneller/);
  assert.doesNotMatch(text, /Leer/);
});

test("Text: Zeilenenden und Leerzeilen aufgeräumt", async () => {
  const text = await textAus(Buffer.from("Erste Zeile  \r\n\r\n\r\n\r\nZweite Zeile"), "txt");
  assert.equal(text, "Erste Zeile\n\nZweite Zeile");
});
