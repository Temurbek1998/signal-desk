import assert from "node:assert/strict";
import { test } from "node:test";
import { parseDecision, SWING_LIMITS, trackPlan, validatePlan } from "../src/lib/aiTrade.ts";

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

test("validatePlan: swing chegaralari (D1 ATR, TP1 1R, TP2 2R)", () => {
  const ok = validatePlan({ action: "BUY", sl: 4120, tp1: 4265, tp2: 4340 }, 4190, 60, SWING_LIMITS);
  assert.ok(ok.plan);
  assert.match(validatePlan({ action: "BUY", sl: 4120, tp1: 4230, tp2: 4290 }, 4190, 60, SWING_LIMITS).error!, /TP1/);
  assert.match(validatePlan({ action: "BUY", sl: 4120, tp1: 4265, tp2: 4300 }, 4190, 60, SWING_LIMITS).error!, /TP2/);
  assert.match(validatePlan({ action: "BUY", sl: 4050, tp1: 4330, tp2: 4500 }, 4190, 60, SWING_LIMITS).error!, /D1 ATR/);
});

test("trackPlan: Claude ko'chirgan SL", () => {
  // t=2 da SL 90 dan 98 ga ko'chdi: undan oldingi shamlarga ta'sir qilmaydi.
  const stops = [{ t: 2, sl: 98 }];
  assert.deepEqual(trackPlan(plan, 0, [c(1, 105, 97), c(2, 104, 97.5)], 24, 3, stops), { status: "trail", resultR: -0.2, at: 2, tp1Hit: false });
  // TP1 dan keyin (SL kirishda) 105 ga ko'chdi: yarmi TP1 (+0.5R), yarmi 105 da (+0.25R).
  assert.deepEqual(trackPlan(plan, 0, [c(1, 111, 101), c(3, 108, 104)], 24, 4, [{ t: 2, sl: 105 }]), { status: "trail", resultR: 0.75, at: 3, tp1Hit: true });
  // Uzoqroq SL e'tiborga olinmaydi.
  assert.equal(trackPlan(plan, 0, [c(1, 105, 89)], 24, 2, [{ t: 0, sl: 80 }]).status, "sl");
});

test("qayta ko'rish: qaror, SL tekshiruvi, pips", async () => {
  const { activeStop, parseReview, resultAt, toPips, validateStopMove } = await import("../src/lib/aiTrade.ts");
  assert.deepEqual(parseReview('{"action":"move_sl","new_sl":95,"confidence":70,"reason":"x"}'), { action: "MOVE_SL", newSl: 95, confidence: 70, reason: "x" });
  assert.equal(parseReview('{"action":"CLOSE","new_sl":0}')!.newSl, null);
  assert.equal(parseReview('{"action":"WAIT"}'), null);
  assert.equal(validateStopMove("BUY", 90, 95, 100, 1), null);
  assert.match(validateStopMove("BUY", 90, 85, 100, 1)!, /yaqin emas/);
  assert.match(validateStopMove("SELL", 110, 100.5, 100, 1)!, /juda yaqin/);
  assert.equal(activeStop(90, 1, [{ t: 1, sl: 95 }, { t: 2, sl: 93 }]), 95);
  assert.equal(resultAt(plan, 105, false), 0.5);
  assert.equal(resultAt(plan, 105, true), 0.75);
  assert.equal(Math.round(toPips("XAU/USD", 70)), 700);
  assert.equal(Math.round(toPips("USD/JPY", 0.5)), 50);
  assert.equal(Math.round(toPips("EUR/USD", 0.0025)), 25);
});
