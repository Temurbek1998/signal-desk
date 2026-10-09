import assert from "node:assert/strict";
import { test } from "node:test";
import { parseAnalysis } from "../src/lib/aiAnalysis.ts";

test("parseAnalysis: noto'g'ri va uzoq darajalar tashlanadi", () => {
  const a = parseAnalysis({
    strategy: "Trend davomi", trends: { D1: "up", H4: "down", H1: "x" },
    levels: [{ price: 2655, kind: "support", note: "tub" }, { price: 9000, kind: "resistance", note: "uzoq" }, { price: 2670, kind: "boshqa", note: "" }],
    zones: [{ from: 2650, to: 2645, kind: "demand", note: "z" }, { from: 2660, to: 2660, kind: "supply", note: "bo'sh" }],
    reasons: ["a", "", "b"], risks: "x", invalidation: 2640, scenario: "s",
  }, 2660)!;
  assert.deepEqual(a.trends, { D1: "up", H4: "down", H1: "flat", M15: "flat" });
  assert.deepEqual(a.levels, [{ price: 2655, kind: "support", note: "tub" }]);
  assert.deepEqual(a.zones, [{ from: 2645, to: 2650, kind: "demand", note: "z" }]);
  assert.deepEqual(a.reasons, ["a", "b"]);
  assert.deepEqual(a.risks, []);
  assert.equal(a.invalidation, 2640);
  assert.equal(parseAnalysis(null, 2660), null);
  assert.equal(parseAnalysis({ invalidation: 0 }, 2660)!.invalidation, null);
});
