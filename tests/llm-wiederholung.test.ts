// Ausführen: npm.cmd test
import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenAiKompatiblesSprachmodell } from "../src/anbieter/llm.ts";

const echt = globalThis.fetch;
const antwort = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "application/json" } });
const ok = JSON.stringify({ choices: [{ message: { content: '{"text":"Hallo zusammen."}' }, finish_reason: "stop" }] });

async function mitFetch(antworten: string[], lauf: () => Promise<unknown>) {
  let aufrufe = 0;
  globalThis.fetch = (async () => antwort(antworten[Math.min(aufrufe++, antworten.length - 1)]!)) as typeof fetch;
  try {
    const ergebnis = await lauf().then((wert) => ({ wert }), (fehler: Error) => ({ fehler }));
    return { aufrufe, ...ergebnis };
  } finally {
    globalThis.fetch = echt;
  }
}

test("Leerer Antworttext von Broki: einmal noch fragen, dann klappt es", async () => {
  const r = await mitFetch(["", ok], () => new OpenAiKompatiblesSprachmodell().sprechtext("Wissen", "Test"));
  assert.equal(r.aufrufe, 2);
  assert.equal(r.wert, "Hallo zusammen.");
});

test("Abgebrochener Antworttext: ebenfalls ein zweiter Versuch", async () => {
  const r = await mitFetch(['{"choices":[{"mess', ok], () => new OpenAiKompatiblesSprachmodell().sprechtext("Wissen", "Test"));
  assert.equal(r.aufrufe, 2);
  assert.equal(r.wert, "Hallo zusammen.");
});

test("Zweimal leer: klarer Fehler, keine Endlosschleife", async () => {
  const r = await mitFetch(["", ""], () => new OpenAiKompatiblesSprachmodell().sprechtext("Wissen", "Test"));
  assert.equal(r.aufrufe, 2);
  assert.match(r.fehler?.message ?? "", /leere oder unvollständige Antwort/);
});
