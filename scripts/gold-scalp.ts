// Gerakl (skalping robot) uchun oltin M5 sinovi. 1 pip = 0.10 USD.
// Ishlatish: node --experimental-strip-types scripts/gold-scalp.ts <paxg_5m.csv> [xarajat_pips]
import { readFileSync } from "node:fs";
import { atr, ema } from "../src/lib/indicators.ts";
import { marketOpen } from "../src/lib/sessions.ts";
import type { Candle } from "../src/lib/types.ts";

const PIP = 0.1;
const COST = Number(process.argv[3] ?? 5); // spred + komissiya + sirpanish, har savdoga (pips)
const all: Candle[] = readFileSync(process.argv[2], "utf8").trim().split("\n").slice(1)
  .map((l) => { const [t, o, h, lo, c] = l.split(",").map(Number); return { t, o, h, l: lo, c }; })
  .filter((c) => marketOpen("gold", c.t));
const DAY = 864e5;
const days = (all.at(-1)!.t - all[0].t) / DAY;
const A = atr(all, 14);
const E20 = ema(all.map((c) => c.c), 20);
const E50 = ema(all.map((c) => c.c), 50);
const hour = (t: number) => new Date(t).getUTCHours();

type Tr = { at: number; pips: number };

// TP/SL yoki maxBars (vaqt to'xtashi) gacha kuzatadi. Bir shamda ikkalasi bo'lsa SL.
function run(i: number, side: 1 | -1, sl: number, tp: number, maxBars: number): { pips: number; end: number } | null {
  const entry = all[i].c;
  const s = entry - side * sl * PIP, t = entry + side * tp * PIP;
  for (let j = i + 1; j < all.length; j++) {
    const x = all[j];
    if (x.t - all[j - 1].t > 30 * 6e4) return { pips: (side * (all[j - 1].c - entry)) / PIP, end: j - 1 };
    if (side > 0 ? x.l <= s : x.h >= s) return { pips: -sl, end: j };
    if (side > 0 ? x.h >= t : x.l <= t) return { pips: tp, end: j };
    if (j - i >= maxBars) return { pips: (side * (x.c - entry)) / PIP, end: j };
  }
  return null;
}

type Setup = (i: number) => 1 | -1 | 0;

// Razgon: kuchli impuls shami (tana >= k*ATR, yopilish shamning chetida), trend yo'nalishida.
const burst = (k: number, withTrend: boolean): Setup => (i) => {
  const c = all[i], body = c.c - c.o, range = c.h - c.l;
  if (!(A[i - 1] > 0) || Math.abs(body) < k * A[i - 1] || range <= 0) return 0;
  const side = body > 0 ? 1 : -1;
  const nearEdge = side > 0 ? (c.h - c.c) / range < 0.25 : (c.c - c.l) / range < 0.25;
  if (!nearEdge) return 0;
  if (withTrend && (side > 0 ? E20[i] <= E50[i] : E20[i] >= E50[i])) return 0;
  return side;
};

// Mikro breakout: oxirgi n sham oralig'idan chiqish, oraliq tor (ATR ga nisbatan) bo'lsa.
const squeeze = (n: number, maxW: number): Setup => (i) => {
  let hi = -Infinity, lo = Infinity;
  for (let j = i - n; j < i; j++) { hi = Math.max(hi, all[j].h); lo = Math.min(lo, all[j].l); }
  if (!(A[i - 1] > 0) || hi - lo > maxW * A[i - 1]) return 0;
  return all[i].c > hi ? 1 : all[i].c < lo ? -1 : 0;
};

// Trend ichida EMA20 ga qaytish va undan qayta ko'tarilish (skalping pullback).
const emaBounce: Setup = (i) => {
  const c = all[i], p = all[i - 1];
  const gap = Math.abs(E20[i] - E50[i]);
  if (!(A[i] > 0) || gap < 0.5 * A[i]) return 0;
  if (E20[i] > E50[i] && p.l <= E20[i - 1] && c.c > E20[i] && c.c > c.o) return 1;
  if (E20[i] < E50[i] && p.h >= E20[i - 1] && c.c < E20[i] && c.c < c.o) return -1;
  return 0;
};

function test(setup: Setup, sl: number, tp: number, maxBars: number, hours: [number, number]): Tr[] {
  const out: Tr[] = [];
  let busy = -1;
  for (let i = 60; i < all.length - 1; i++) {
    if (i <= busy) continue;
    const h = hour(all[i].t);
    if (h < hours[0] || h >= hours[1]) continue;
    const side = setup(i);
    if (!side) continue;
    const r = run(i, side, sl, tp, maxBars);
    if (!r) break;
    out.push({ at: all[i].t, pips: r.pips - COST });
    busy = r.end;
  }
  return out;
}

const half = (all[0].t + all.at(-1)!.t) / 2;
const rows: string[] = [];
function report(name: string, t: Tr[]) {
  if (t.length < 10) return;
  const sum = (a: Tr[]) => a.reduce((s, x) => s + x.pips, 0);
  let eq = 0, peak = 0, dd = 0;
  for (const x of t) { eq += x.pips; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  const wins = t.filter((x) => x.pips > 0).length;
  rows.push(`${name}\t${t.length}\t${(t.length / days).toFixed(1)}\t${Math.round((wins / t.length) * 100)}%\t${Math.round(sum(t))}\t${(sum(t) / t.length).toFixed(1)}\t${Math.round(sum(t.filter((x) => x.at < half)))}\t${Math.round(sum(t.filter((x) => x.at >= half)))}\t${Math.round(dd)}`);
}

const SETUPS: [string, Setup][] = [
  ["Razgon 1.5ATR trend", burst(1.5, true)], ["Razgon 2ATR trend", burst(2, true)], ["Razgon 2ATR", burst(2, false)], ["Razgon 2.5ATR", burst(2.5, false)], ["Razgon 3ATR", burst(3, false)], ["Razgon 3.5ATR", burst(3.5, false)],
  ["Siqilish 12 <2ATR", squeeze(12, 2)], ["Siqilish 24 <3ATR", squeeze(24, 3)],
  ["EMA20 qaytish", emaBounce],
];
const EXITS: [number, number][] = [[50, 50], [50, 100], [80, 80], [80, 150], [100, 150], [100, 200]];
const SESS: [string, [number, number]][] = [["07-17", [7, 17]], ["12-17", [12, 17]], ["kun bo'yi", [0, 24]]];
for (const [sn, s] of SETUPS) for (const [sl, tp] of EXITS) for (const [hn, hr] of SESS)
  report(`${sn} | SL ${sl} TP ${tp} | ${hn}`, test(s, sl, tp, 24, hr));

console.log(`# ${days.toFixed(0)} kun M5, 1 pip = 0.10 USD, har savdoga ${COST} pips xarajat, vaqt to'xtashi 2 soat`);
console.log("strategiya\tsavdo\tkuniga\twin\tjami pips\to'rtacha\t1-yarim\t2-yarim\tmax pasayish");
console.log(rows.join("\n"));
