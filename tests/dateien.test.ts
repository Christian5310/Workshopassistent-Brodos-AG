// Ausführen: npm.cmd test
// Prüft, ob aus hochgeladenen Dateien der Text für Pinnwand, Merlin und Agenten gelesen wird.
import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { htmlText, istEndung, textAus } from "../src/dateien.ts";

test("Erlaubte Endungen", () => {
  for (const e of ["pdf", "docx", "xlsx", "md", "txt", "html", "htm"]) assert.ok(istEndung(e), e);
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

test("HTML: sichtbarer Text ohne Skripte, Stile und Tags, mit Seitentitel", async () => {
  const seite = `<!doctype html><html><head><title>Prozess &amp; Ideen</title><style>.a{color:red}</style><script>alert("x")</script></head>
<body><h1>Ist-Prozess</h1><p>Angebote&nbsp;versanden &ndash; <b>keine</b> Wiedervorlage.</p><ul><li>Punkt eins</li><li>Gr&#252;&#xDF;e</li></ul><!-- Kommentar --><noscript>Skript aus</noscript></body></html>`;
  const text = await textAus(Buffer.from(seite), "html");
  assert.match(text, /^Prozess & Ideen/);
  assert.match(text, /Ist-Prozess/);
  assert.match(text, /Angebote versanden – keine Wiedervorlage/);
  assert.match(text, /Punkt eins/);
  assert.match(text, /Grüße/);
  for (const raus of ["alert", "color:red", "Kommentar", "Skript aus", "<"]) assert.ok(!text.includes(raus), raus);
  assert.equal(htmlText("<script>nur Skript</script>"), "");
});
