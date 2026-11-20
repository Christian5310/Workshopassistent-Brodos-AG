// Ausführen: npm.cmd test
// Prüft den Kern des Freihand-Modus: Sprechen und Pausen erkennen, kurze Sätze abschneiden, WAV bauen.
import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-ignore: Browser-Modul ohne Typen
import { alsWav, Segmentierer } from "../public/js/freihand-kern.js";

const RATE = 48_000;
const BLOCK = 128;
const bloecke = (ms: number) => Math.round((ms * RATE) / 1000 / BLOCK);

/** Zufallsrauschen oder Ton mit gegebener Lautstärke (Spitzenwert) */
function block(lautstaerke: number, ton: boolean, nr: number): Float32Array {
  const b = new Float32Array(BLOCK);
  for (let i = 0; i < BLOCK; i++) b[i] = ton ? lautstaerke * Math.sin(((nr * BLOCK + i) / RATE) * 2 * Math.PI * 220) : (Math.random() - 0.5) * lautstaerke;
  return b;
}

function lauf(schritte: [ms: number, laut: boolean][], pausiert = false): Float32Array[] {
  const saetze: Float32Array[] = [];
  const s = new Segmentierer({ rate: RATE, beiSatz: (x: Float32Array) => saetze.push(x) });
  let nr = 0;
  for (const [ms, laut] of schritte) for (let i = 0; i < bloecke(ms); i++) s.block(block(laut ? 0.2 : 0.004, laut, nr++), pausiert);
  return saetze;
}

test("Ein kurzer Satz mit Pause danach wird abgeschnitten", () => {
  const saetze = lauf([[1500, false], [2000, true], [1500, false]]);
  assert.equal(saetze.length, 1);
  const sekunden = saetze[0]!.length / RATE;
  assert.ok(sekunden > 2.0 && sekunden < 3.2, `Länge ${sekunden.toFixed(2)} s: Satz plus kurzer Vorlauf und Rest`);
});

test("Zwei Sätze mit Pause dazwischen sind zwei Abschnitte", () => {
  const saetze = lauf([[1000, false], [1200, true], [1200, false], [1500, true], [1500, false]]);
  assert.equal(saetze.length, 2);
});

test("Husten oder Klacken (zu kurz) wird ignoriert", () => {
  assert.equal(lauf([[1000, false], [100, true], [1500, false]]).length, 0);
});

test("Dauerrede über zehn Sekunden ist kein Befehl und wird verworfen", () => {
  assert.equal(lauf([[1000, false], [12_000, true], [1500, false]]).length, 0);
});

test("Solange Merlin spricht, wird nichts mitgenommen", () => {
  assert.equal(lauf([[1000, false], [2000, true], [1500, false]], true).length, 0);
});

test("Leise Umgebung ohne Sprechen löst nichts aus", () => {
  assert.equal(lauf([[8000, false]]).length, 0);
});

test("WAV: 16 kHz, mono, 16 Bit, Kopf stimmt", async () => {
  const wav: Blob = alsWav(new Float32Array(RATE), RATE); // 1 Sekunde Stille
  const daten = new DataView(await wav.arrayBuffer());
  assert.equal(wav.type, "audio/wav");
  assert.equal(String.fromCharCode(daten.getUint8(0), daten.getUint8(1), daten.getUint8(2), daten.getUint8(3)), "RIFF");
  assert.equal(daten.getUint32(24, true), 16_000);
  assert.equal(daten.getUint16(22, true), 1);
  assert.equal(daten.getUint16(34, true), 16);
  assert.equal(daten.getUint32(40, true), 32_000, "1 s bei 16 kHz und 16 Bit = 32 000 Byte");
});
