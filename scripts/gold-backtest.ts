import { marketOpen } from "../src/lib/sessions.ts";
// Oltin (XAU/USD) uchun alohida backtest.
//
//   node --experimental-strip-types scripts/gold-backtest.ts <paxg_15m.csv>
//
// Ma'lumot: Binance PAXG/USDT 15 daqiqalik shamlari (PAXG oltinga bog'langan token, spot XAU/USD ga yaqin yuradi).
// PAXG dam olish kunlari ham savdolanadi, oltin bozori esa yopiq: shu vaqtlardagi shamlar olib tashlanadi,
// shunda ma'lumot brokerdagi XAU/USD ga o'xshaydi. Xarajat: spred taxminan 0.01% bir tomonga.
// Har bir variant butun davrda va ikki yarmida alohida sinanadi: ikkala yarmida ijobiy bo'lgani ishonchliroq.

import { readFileSync } from "node:fs";
import { bucket, simulate, summarize, type Trade, type Variant } from "./backtest.ts";
import { DEFAULT_RULES } from "../src/lib/engine.ts";
import type { Candle } from "../src/lib/types.ts";

const FEE_PCT = 0.01;

// Oltin bozori yopiq: juma 21:00 UTC dan yakshanba 22:00 UTC gacha va har kuni 21:00–22:00 UTC tanaffus.
export const marketOpenGold = (t: number) => marketOpen("gold", t);

function load(path: string): Candle[] {
  return readFileSync(path, "utf8").trim().split("\n").slice(1).map((l) => {
    const [t, o, h, lo, c] = l.split(",").map(Number);
    return { t, o, h, l: lo, c };
  }).filter((c) => marketOpenGold(c.t));
}

const TFS: [string, number, number][] = [["M15", 15, 60], ["M30", 30, 60], ["H1", 60, 240]];

function variants(): Variant[] {
  const out: Variant[] = [];
  const sessions: [string, [number, number] | undefined][] = [["24 soat", undefined], ["London+NY 07–20", [7, 20]], ["NY 12–20", [12, 20]]];
  for (const [sname, hours] of sessions)
    for (const adx of [20, 25])
      for (const sl of [1.5, 2, 2.5, 3])
        for (const [a, b] of [[0.5, 1.5], [1, 2], [1, 3]])
          out.push({
            name: `${sname} | ADX≥${adx} | SL ${sl} ATR | TP ${a}R/${b}R`,
            slMult: sl, tp1R: a, tp2R: b, minConf: 0, category: "gold", hours,
            rules: { ...DEFAULT_RULES, minAdx: adx },
          });
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const all = load(process.argv[2]);
  const half = all.length >> 1;
  const parts = { full: all, h1: all.slice(0, half), h2: all.slice(half) };
  const days = (all.at(-1)!.t - all[0].t) / 86_400_000;
  console.log(`# ${all.length} sham (bozor ochiq vaqti), ${new Date(all[0].t).toISOString().slice(0, 10)} — ${new Date(all.at(-1)!.t).toISOString().slice(0, 10)}, ${days.toFixed(0)} kun`);
  console.log("tf\tvariant\tsavdo\tkuniga\twin\tnetR\tPF\th1 netR\th2 netR");
  for (const [tf, m, hm] of TFS) {
    for (const v of variants()) {
      const run = (c: Candle[]): Trade[] => simulate(bucket(c, m), bucket(c, hm), m, hm, v);
      const f = summarize(run(parts.full), FEE_PCT), a = summarize(run(parts.h1), FEE_PCT), b = summarize(run(parts.h2), FEE_PCT);
      console.log(`${tf}\t${v.name}\t${f.trades}\t${(f.trades / days).toFixed(2)}\t${(f.winRate * 100).toFixed(0)}%\t${f.avgR.toFixed(3)}\t${f.profitFactor.toFixed(2)}\t${a.avgR.toFixed(3)} (${a.trades})\t${b.avgR.toFixed(3)} (${b.trades})`);
    }
  }
}
