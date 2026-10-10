import assert from "node:assert/strict";
import { test } from "node:test";
import { detectSpike, followSpike } from "../src/lib/spike.ts";

const M = 60_000;
const c = (t: number, o: number, h: number, l: number, cl: number) => ({ t: t * M, o, h, l, c: cl });
const flat = Array.from({ length: 10 }, (_, i) => c(i, 2650, 2650.5, 2649.5, 2650));

test("detectSpike: 2-3 daqiqada 180 pips (18 $)", () => {
  const down = [...flat, c(10, 2650, 2650.2, 2640, 2641), c(11, 2641, 2641.5, 2630, 2631)];
  const s = detectSpike("XAU/USD", down, 180)!;
  assert.deepEqual({ side: s.side, bars: s.bars, move: s.movePips, peak: s.peakPips }, { side: "SELL", bars: 2, move: 190, peak: 200 });
  // 3 shamda yig'ilgan harakat.
  const slow = [...flat, c(10, 2650, 2657, 2650, 2656), c(11, 2656, 2663, 2655, 2662), c(12, 2662, 2669, 2661, 2668.5)];
  assert.equal(detectSpike("XAU/USD", slow, 180)!.bars, 3);
  // Faqat soya: hisoblanmaydi.
  assert.equal(detectSpike("XAU/USD", [...flat, c(10, 2650, 2670, 2649, 2651), c(11, 2651, 2652, 2650, 2651)], 180), null);
  // Harakat 2 sham oldin tugagan: lookback 1 da yo'q, 5 da bor.
  const old = [...down, c(12, 2631, 2632, 2630, 2631), c(13, 2631, 2632, 2630, 2631.5)];
  assert.equal(detectSpike("XAU/USD", old, 180), null);
  assert.equal(detectSpike("XAU/USD", old, 180, 5)!.side, "SELL");
});

test("followSpike: keyin qancha yurdi", () => {
  const after = [c(12, 2631, 2632, 2625, 2626), c(16, 2626, 2634, 2626, 2633), c(27, 2633, 2633, 2620, 2622)];
  const f = followSpike("XAU/USD", "SELL", 2631, 11 * M, after);
  assert.deepEqual(f, { minutes: 3, mfePips: 110, maePips: 30, after5: -20, after15: 90, after30: null, after60: null });
});
