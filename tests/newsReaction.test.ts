import assert from "node:assert/strict";
import { test } from "node:test";
import { checkInvalidation, groupByTime, newsOutcome, parseNewsCall, reactionStats } from "../src/lib/newsReaction.ts";

const M = 60_000;
const c = (t: number, o: number, h: number, l: number, cl: number) => ({ t: t * M, o, h, l, c: cl });

test("reactionStats: oltinda pips (1 pip = 0.10 $)", () => {
  const m1 = [c(0, 2650, 2651, 2649, 2650), c(1, 2650, 2650.5, 2649.5, 2650), c(2, 2650, 2650, 2640, 2642), c(3, 2642, 2643, 2636, 2638)];
  const s = reactionStats("XAU/USD", m1, 2 * M)!;
  assert.equal(s.base, 2650);
  assert.equal(s.firstMinPips, -80);
  assert.equal(s.movePips, -120);
  assert.equal(s.downPips, 140);
  assert.equal(s.upPips, 0);
  assert.equal(s.minutes, 2);
  assert.equal(s.preRangePips, 20);
  assert.equal(reactionStats("XAU/USD", m1, 10 * M), null);
});

test("parseNewsCall: JSON va chegaralar", () => {
  const v = parseNewsCall('```{"direction":"sell","confidence":140,"target_pips":-150.4,"invalidation":2660,"horizon_min":5,"entry":"x","reason":"y"}```')!;
  assert.deepEqual(v, { direction: "SELL", confidence: 100, targetPips: 150, invalidation: 2660, horizonMin: 15, entry: "x", reason: "y" });
  assert.equal(parseNewsCall('{"direction":"WAIT","target_pips":50,"invalidation":1}')!.targetPips, 0);
  assert.equal(parseNewsCall('{"direction":"HOLD"}'), null);
  assert.equal(parseNewsCall("yo'q"), null);
  assert.equal(checkInvalidation(v, 2650), 2660);
  assert.equal(checkInvalidation({ ...v, invalidation: 2640 }, 2650), null);
});

test("newsOutcome: maqsad, bekor, muddat", () => {
  const cs = [c(1, 2640, 2641, 2636, 2637), c(2, 2637, 2638, 2624, 2625)];
  assert.deepEqual(newsOutcome("XAU/USD", "SELL", 2640, 150, 2650, cs, M, 60, M, 3 * M), { status: "target", resultPips: 150, mfePips: 160, maePips: 10 });
  assert.equal(newsOutcome("XAU/USD", "BUY", 2640, 150, 2636.5, cs, M, 60, M, 3 * M).status, "stop");
  const exp = newsOutcome("XAU/USD", "SELL", 2640, 500, 2650, cs, M, 2, M, 10 * M);
  assert.deepEqual(exp, { status: "expired", resultPips: 150, mfePips: 160, maePips: 10 });
  assert.equal(newsOutcome("XAU/USD", "SELL", 2640, 500, 2650, cs, M, 60, M, 3 * M).status, "open");
});

test("groupByTime: bir vaqtdagi yangiliklar birga", () => {
  const g = groupByTime([{ time: 2, n: "a" }, { time: 1, n: "b" }, { time: 2, n: "c" }]);
  assert.deepEqual(g.map((x) => [x.time, x.events.map((e) => e.n)]), [[1, ["b"]], [2, ["a", "c"]]]);
});
