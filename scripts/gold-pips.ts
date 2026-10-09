// Oltin: pipsga mo'ljallangan strategiyalar sinovi (1 pip = 0.10 USD).
// Ishlatish: node --experimental-strip-types scripts/gold-pips.ts <paxg_15m.csv>
import { readFileSync } from "node:fs";
import { analyze, DEFAULT_RULES, generateSignal, type Rules } from "../src/lib/engine.ts";
import { bucketByTime } from "../src/lib/market.ts";
import { marketOpen } from "../src/lib/sessions.ts";
import type { Candle } from "../src/lib/types.ts";

const PIP = 0.1;
const COST = 5; // pips: spred + sirpanish, har savdoga
const all: Candle[] = readFileSync(process.argv[2], "utf8").trim().split("\n").slice(1)
  .map((l) => { const [t, o, h, lo, c] = l.split(",").map(Number); return { t, o, h, l: lo, c }; })
  .filter((c) => marketOpen("gold", c.t));
const DAY = 864e5;
const days = (all.at(-1)!.t - all[0].t) / DAY;

type Tr = { at: number; pips: number; win: boolean };

// Kirishdan keyin TP yoki SL gacha kuzatadi; kun oxirida (21:00 UTC) yopiladi. Bir shamda ikkalasi bo'lsa SL.
function run(c: Candle[], i: number, side: 1 | -1, entry: number, slPips: number, tpPips: number, maxBars = 1e9): { pips: number; end: number } {
  const sl = entry - side * slPips * PIP, tp = entry + side * tpPips * PIP;
  for (let j = i + 1; j < c.length && j <= i + maxBars; j++) {
    const x = c[j];
    if (side > 0 ? x.l <= sl : x.h >= sl) return { pips: -slPips, end: j };
    if (side > 0 ? x.h >= tp : x.l <= tp) return { pips: tpPips, end: j };
    if (new Date(x.t).getUTCHours() === 20 && new Date(x.t).getUTCMinutes() === 45) return { pips: (side * (x.c - entry)) / PIP, end: j };
  }
  return { pips: NaN, end: c.length };
}

// A. Sessiya oralig'i yorib o'tilishi: 00:00 dan start gacha oraliq, keyin 6 soat ichida M15 yopilishi oraliqdan chiqsa kirish.
function breakout(start: number, slMode: "range" | number, tp: number, maxRange: number): Tr[] {
  const c = all, out: Tr[] = [];
  const byDay = new Map<number, number[]>();
  c.forEach((x, i) => { const d = Math.floor(x.t / DAY); byDay.set(d, [...(byDay.get(d) ?? []), i]); });
  for (const idx of byDay.values()) {
    const rng = idx.filter((i) => new Date(c[i].t).getUTCHours() < start);
    if (rng.length < 12) continue;
    const hi = Math.max(...rng.map((i) => c[i].h)), lo = Math.min(...rng.map((i) => c[i].l));
    const width = (hi - lo) / PIP;
    if (width > maxRange) continue;
    for (const i of idx) {
      const h = new Date(c[i].t).getUTCHours();
      if (h < start || h >= start + 6) continue;
      const side = c[i].c > hi ? 1 : c[i].c < lo ? -1 : 0;
      if (!side) continue;
      const sl = slMode === "range" ? Math.max(100, (side > 0 ? c[i].c - lo : hi - c[i].c) / PIP) : slMode;
      const r = run(c, i, side as 1 | -1, c[i].c, sl, tp);
      if (!Number.isNaN(r.pips)) out.push({ at: c[i].t, pips: r.pips - COST, win: r.pips > 0 });
      break;
    }
  }
  return out;
}

// B. Robotning trend ichidagi pullback qoidasi, lekin fiks pips maqsad bilan.
function pullback(tfMin: number, hMin: number, rules: Rules, sl: number, tp: number): Tr[] {
  const c = bucketByTime(all, tfMin), hi = bucketByTime(all, hMin), out: Tr[] = [];
  let busy = -1, h = 0;
  for (let n = 60; n < c.length - 1; n++) {
    if (n <= busy) continue;
    const close = c[n].t + tfMin * 6e4;
    while (h < hi.length && hi[h].t + hMin * 6e4 <= close) h++;
    const s = generateSignal("X", "gold", "M15", c.slice(Math.max(0, n - 199), n + 1), analyze(hi.slice(Math.max(0, h - 200), h)), rules);
    if (!s?.side) continue;
    const r = run(c, n, s.side === "BUY" ? 1 : -1, c[n].c, sl, tp);
    if (Number.isNaN(r.pips)) break;
    out.push({ at: close, pips: r.pips - COST, win: r.pips > 0 });
    busy = r.end;
  }
  return out;
}

const half = (all[0].t + all.at(-1)!.t) / 2;
function report(name: string, t: Tr[]) {
  if (!t.length) return console.log(`${name}\t0`);
  const sum = (a: Tr[]) => a.reduce((s, x) => s + x.pips, 0);
  let eq = 0, peak = 0, dd = 0;
  for (const x of t) { eq += x.pips; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  const wins = t.filter((x) => x.win).length;
  console.log(`${name}\t${t.length}\t${(t.length / days).toFixed(2)}\t${Math.round((wins / t.length) * 100)}%\t${Math.round(sum(t))}\t${Math.round(sum(t) / t.length)}\t${Math.round((sum(t) / days) * 30)}\t${Math.round(sum(t.filter((x) => x.at < half)))}\t${Math.round(sum(t.filter((x) => x.at >= half)))}\t${Math.round(dd)}`);
}

console.log(`# ${days.toFixed(0)} kun, 1 pip = 0.10 USD, har savdoga ${COST} pips xarajat`);
console.log("strategiya\tsavdo\tkuniga\twin\tjami pips\to'rtacha\toyiga\t1-yarim\t2-yarim\tmax pasayish");
for (const start of [7, 13]) for (const slm of ["range", 200, 300] as const) for (const tp of [300, 400]) for (const maxR of [400, 800, 1e9])
  report(`Breakout ${start}:00 | SL ${slm} | TP ${tp} | oraliq<${maxR === 1e9 ? "∞" : maxR}`, breakout(start, slm, tp, maxR));
const LOOSE: Rules = { ...DEFAULT_RULES, minAdx: 0, requireHigher: false, maxFeeR: 0 };
for (const [tfn, tf, hm] of [["M15", 15, 60], ["M30", 30, 240], ["H1", 60, 240]] as const)
  for (const [rn, r] of [["joriy", DEFAULT_RULES], ["yumshoq", LOOSE]] as const)
    for (const [sl, tp] of [[200, 300], [300, 300], [300, 400], [400, 400]])
      report(`Pullback ${tfn} ${rn} | SL ${sl} | TP ${tp}`, pullback(tf, hm, r, sl, tp));
