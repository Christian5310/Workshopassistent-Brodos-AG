import { test } from "node:test";
import assert from "node:assert/strict";
import { repariereJson } from "../src/anbieter/json-reparatur.ts";

const lies = (t: string) => JSON.parse(repariereJson(t));

test("fehlendes Komma zwischen Einträgen", () => assert.deepEqual(lies('{"a": [1 2]}'), { a: [1, 2] }));
test("Anführungszeichen im Text", () => assert.equal(lies('{"t": "Kunde sagt "das dauert" oft"}').t, 'Kunde sagt "das dauert" oft'));
test("überzähliges Komma", () => assert.deepEqual(lies('{"a": [1, 2,],}'), { a: [1, 2] }));
test("abgeschnittenes Ende", () => assert.deepEqual(lies('{"a": [{"t": "x"}, {"t": "y'), { a: [{ t: "x" }, { t: "y" }] }));
