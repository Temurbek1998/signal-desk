// Oltin M15 tanlangan sozlama (SL 2.5 ATR, TP 0.5R/1.5R, ADX>=20, 24 soat) savdolari ro'yxati, JSON.
//   node --experimental-strip-types scripts/gold-trades.ts <paxg_15m.csv>
import { readFileSync } from "node:fs";
import { bucket, simulate } from "./backtest.ts";
import { DEFAULT_RULES } from "../src/lib/engine.ts";
import { marketOpen } from "../src/lib/sessions.ts";
import type { Candle } from "../src/lib/types.ts";

const FEE_PCT = 0.01;
const all: Candle[] = readFileSync(process.argv[2], "utf8").trim().split("\n").slice(1)
  .map((l) => { const [t, o, h, lo, c] = l.split(",").map(Number); return { t, o, h, l: lo, c }; })
  .filter((c) => marketOpen("gold", c.t));
const trades = simulate(bucket(all, 15), bucket(all, 60), 15, 60, {
  name: "M15", slMult: 2.5, tp1R: 0.5, tp2R: 1.5, minConf: 0, category: "gold", rules: { ...DEFAULT_RULES, minAdx: 20 },
});
console.log(JSON.stringify({
  from: all[0].t, to: all.at(-1)!.t,
  trades: trades.map((t) => ({
    at: t.at, exitAt: t.exitAt, side: t.side, entry: t.entry, sl: t.slPrice, tp1: t.tp1Price, tp2: t.tp2Price,
    result: t.tp2 ? "TP2" : t.tp1 ? "TP1" : "SL", r: +(t.r - (2 * FEE_PCT) / 100 / t.riskFrac).toFixed(3),
  })),
}));
