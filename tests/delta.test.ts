// Ausführen: npm.cmd test
import { test } from "node:test";
import assert from "node:assert/strict";
import { arbeitsstand, wendeAenderungenAn } from "../src/delta.ts";
import { ProtokollSchema } from "../src/types.ts";

const p = ProtokollSchema.parse({
  agenda: [{ id: "A1", titel: "Eins", status: "erledigt" }, { id: "A2", titel: "Zwei", status: "läuft" }],
  todos: [
    { id: "T1", text: "CRM-Export", status: "offen", agendapunkt: "A1" },
    { id: "T2", text: "Angebot Müller", status: "offen", agendapunkt: "A2" },
  ],
  offene_fragen: [{ id: "F1", text: "Gilt das für Bestandskunden?", status: "offen" }],
});

test("Arbeitsstand: nur laufender Punkt vollständig, übrige offene To-dos als Kurzliste", () => {
  const a = arbeitsstand(p, "A2");
  assert.deepEqual(a.todos.map((t) => t.id), ["T2"]);
  assert.deepEqual(a.uebrige_offene_todos, [{ id: "T1", text: "CRM-Export" }]);
});

test("Änderungen: neu, erledigt, beantwortet", () => {
  const neu = ProtokollSchema.parse(wendeAenderungenAn(p, { neu: { todos: [{ text: "Schulung", owner: "Tom" }] }, erledigt: ["T1"], beantwortet: ["F1"] }));
  assert.equal(neu.todos.find((t) => t.id === "T1")?.status, "erledigt");
  assert.equal(neu.offene_fragen[0]?.status, "beantwortet");
  assert.equal(neu.todos.at(-1)?.text, "Schulung");
});

test("Altes Format (ganzer Stand) bleibt unverändert", () => {
  assert.equal(wendeAenderungenAn(p, p), p);
});
