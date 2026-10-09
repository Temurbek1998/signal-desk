import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDecision, trackPlan, validatePlan } from "../src/lib/aiTrade.ts";

test("parseDecision: matn ichidagi JSON", () => {
  const d = parseDecision('```json\n{"action":"buy","sl":"2650","tp1":2665,"tp2":2680,"confidence":72,"reason":"x"}\n```');
  assert.deepEqual(d, { action: "BUY", sl: 2650, tp1: 2665, tp2: 2680, confidence: 72, reason: "x" });
  assert.equal(parseDecision("hech narsa"), null);
  assert.equal(parseDecision('{"action":"HOLD"}'), null);
});

test("validatePlan: darajalar tekshiriladi", () => {
  const ok = validatePlan({ action: "BUY", sl: 2650, tp1: 2665, tp2: 2680 }, 2660, 10);
  assert.deepEqual(ok.plan, { side: "BUY", entry: 2660, sl: 2650, tp1: 2665, tp2: 2680 });
  assert.match(validatePlan({ action: "BUY", sl: 2670, tp1: 2665, tp2: 2680 }, 2660, 10).error!, /tomonda/);
  assert.match(validatePlan({ action: "SELL", sl: 2700, tp1: 2640, tp2: 2600 }, 2660, 10).error!, /ATR/);
  assert.match(validatePlan({ action: "SELL", sl: 2670, tp1: 2658, tp2: 2640 }, 2660, 10).error!, /TP1/);
  assert.equal(validatePlan({ action: "WAIT" }, 2660, 10).error, "kutish");
});

const c = (t: number, h: number, l: number, cl = (h + l) / 2) => ({ t, o: cl, h, l, c: cl });
const plan = { side: "BUY" as const, entry: 100, sl: 90, tp1: 110, tp2: 120 };

test("trackPlan: SL, TP1 dan keyin kirish, TP2", () => {
  assert.deepEqual(trackPlan(plan, 0, [c(1, 105, 95), c(2, 101, 89)]), { status: "sl", resultR: -1, at: 2, tp1Hit: false });
  assert.deepEqual(trackPlan(plan, 0, [c(1, 111, 99), c(2, 105, 99.5)]), { status: "be", resultR: 0.5, at: 2, tp1Hit: true });
  assert.deepEqual(trackPlan(plan, 0, [c(1, 111, 101), c(2, 121, 105)]), { status: "tp2", resultR: 1.5, at: 2, tp1Hit: true });
  // Ochilishdan oldingi shamlar hisobga olinmaydi.
  assert.equal(trackPlan(plan, 5, [c(1, 101, 80), c(6, 104, 96)], 24, 6).status, "open");
});

test("trackPlan: SELL va muddat o'tishi", () => {
  const sell = { side: "SELL" as const, entry: 100, sl: 110, tp1: 90, tp2: 80 };
  assert.equal(trackPlan(sell, 0, [c(1, 101, 89)], 24, 2).status, "tp1");
  const exp = trackPlan(sell, 0, [c(1, 102, 96, 95)], 1, 2 * 3600_000);
  assert.deepEqual(exp, { status: "expired", resultR: 0.5, at: 1, tp1Hit: false });
});
