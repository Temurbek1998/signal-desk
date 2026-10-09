// Robotni tarixiy shamlarda sinash.
//
//   node --experimental-strip-types scripts/backtest.ts <fayl.csv>[:daqiqa] ...
//   SPLIT=1 yoki SPLIT=2 — faqat birinchi yoki ikkinchi yarmi.
//
// CSV ustunlari: t,o,h,l,c (t — millisekund). Fayl nomidan keyingi ":5" shamlar necha
// daqiqalik ekanini bildiradi (standart 5). Kichik shamlar M5, M15, M30, H1 ga yig'iladi.
// Har bir signal kirish narxida ochiladi va keyingi shamlarda TP/SL tekshiriladi.
// Bitta shamda ham SL, ham TP bo'lsa, ehtiyotkorlik bilan SL hisoblanadi.

import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { analyze, generateSignal, DEFAULT_RULES, SL_ATR, SL_ATR_BY_CATEGORY, TP1_R, TP2_R, type Rules } from "../src/lib/engine.ts";
import type { Candle, Category, Timeframe } from "../src/lib/types.ts";

const WINDOW = 200;
const TFS: [Timeframe, number, number][] = [
  ["M5", 5, 15],
  ["M15", 15, 60],
  ["M30", 30, 60],
  ["H1", 60, 240],
];

export type Variant = {
  name: string; slMult: number; tp1R: number; tp2R: number; minConf: number; rules?: Rules;
  category?: Category; // komissiya filtri uchun (standart: crypto)
  hours?: [number, number]; // faqat shu UTC soatlarda kirish, masalan [7, 20] (London + Nyu-York)
};

export function bucket(candles: Candle[], minutes: number): Candle[] {
  const ms = minutes * 60_000;
  const out: Candle[] = [];
  for (const c of candles) {
    const t = Math.floor(c.t / ms) * ms;
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.h = Math.max(last.h, c.h);
      last.l = Math.min(last.l, c.l);
      last.c = c.c;
    } else out.push({ t, o: c.o, h: c.h, l: c.l, c: c.c });
  }
  return out;
}

// riskFrac: SL masofasi kirish narxiga nisbatan (komissiyani R da hisoblash uchun).
export type Trade = {
  r: number; tp1: boolean; tp2: boolean; sl: boolean; riskFrac: number; at: number; conf: number; side?: "BUY" | "SELL";
  entry?: number; slPrice?: number; tp1Price?: number; tp2Price?: number; exitAt?: number; // savdo tarixi uchun
};

export function simulate(candles: Candle[], higher: Candle[], tfMin: number, hMin: number, v: Variant): Trade[] {
  const trades: Trade[] = [];
  let busyUntil = -1;
  let h = 0;
  for (let n = 60; n < candles.length - 1; n++) {
    if (n <= busyUntil) continue;
    const closeTime = candles[n].t + tfMin * 60_000;
    while (h < higher.length && higher[h].t + hMin * 60_000 <= closeTime) h++;
    const hAnalysis = analyze(higher.slice(Math.max(0, h - WINDOW), h));
    if (v.hours) {
      const hr = new Date(closeTime).getUTCHours();
      if (hr < v.hours[0] || hr >= v.hours[1]) continue;
    }
    const s = generateSignal("X", v.category ?? "crypto", "M5", candles.slice(Math.max(0, n + 1 - WINDOW), n + 1), hAnalysis, v.rules ?? DEFAULT_RULES);
    if (!s?.side || s.confidence < v.minConf) continue;

    const dir = s.side === "BUY" ? 1 : -1;
    const risk = Math.abs(s.entry - s.sl!) * (v.slMult / SL_ATR_BY_CATEGORY[v.category ?? "crypto"]);
    let sl = s.entry - dir * risk;
    const tp1 = s.entry + dir * risk * v.tp1R;
    const tp2 = s.entry + dir * risk * v.tp2R;
    const t: Trade = { r: 0, tp1: false, tp2: false, sl: false, riskFrac: risk / s.entry, at: closeTime, conf: s.confidence, side: s.side, entry: s.entry, slPrice: sl, tp1Price: tp1, tp2Price: tp2 };
    let j = n + 1;
    for (; j < candles.length; j++) {
      const c = candles[j];
      const hitSl = dir > 0 ? c.l <= sl : c.h >= sl;
      if (hitSl) {
        if (!t.tp1) { t.sl = true; t.r = -1; }
        // TP1 dan keyin SL kirishga ko'chirilgan: qolgan yarmi 0 da yopiladi.
        break;
      }
      if (!t.tp1 && (dir > 0 ? c.h >= tp1 : c.l <= tp1)) {
        t.tp1 = true;
        t.r = 0.5 * v.tp1R; // pozitsiyaning yarmi TP1 da yopiladi
        sl = s.entry;
      }
      if (t.tp1 && (dir > 0 ? c.h >= tp2 : c.l <= tp2)) {
        t.tp2 = true;
        t.r = 0.5 * v.tp1R + 0.5 * v.tp2R;
        break;
      }
    }
    if (j >= candles.length) break; // ma'lumot tugadi, natija noma'lum
    t.exitAt = candles[j].t + tfMin * 60_000;
    trades.push(t);
    busyUntil = j;
  }
  return trades;
}

// feePct: bir tomonlama komissiya foizda (kirish + chiqish = 2 marta). Natija R da komissiyadan keyin.
export function summarize(trades0: Trade[], feePct = 0) {
  const trades = trades0.map((t) => ({ ...t, r: t.r - (2 * feePct) / 100 / t.riskFrac }));
  const n = trades.length;
  const wins = trades.filter((t) => t.tp1).length;
  const gross = trades.filter((t) => t.r > 0).reduce((a, t) => a + t.r, 0);
  const loss = -trades.filter((t) => t.r < 0).reduce((a, t) => a + t.r, 0);
  return {
    trades: n,
    winRate: n ? wins / n : 0,
    tp2Rate: n ? trades.filter((t) => t.tp2).length / n : 0,
    avgR: n ? trades.reduce((a, t) => a + t.r, 0) / n : 0,
    profitFactor: loss ? gross / loss : Infinity,
  };
}

function load(path: string): Candle[] {
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .slice(1)
    .map((l) => {
      const [t, o, h, lo, c] = l.split(",").map(Number);
      return { t, o, h, l: lo, c };
    });
}

const OLD: Rules = { mode: "macd", minAdx: 0, requireHigher: false, maxFeeR: 0 };
export const VARIANTS: Variant[] = [
  { name: "Joriy robot: pullback + ADX ≥ 20 + yuqori taymfreym, SL 2 ATR, TP 0.5R/1.5R", slMult: SL_ATR, tp1R: TP1_R, tp2R: TP2_R, minConf: 0 },
  { name: "Joriy qoidalar, TP 1R/2R va SL 1.5 ATR bilan", slMult: 1.5, tp1R: 1, tp2R: 2, minConf: 0 },
  { name: "Birinchi versiya: MACD kesishuvi, SL 1.5 ATR, TP 1R/2R", slMult: 1.5, tp1R: 1, tp2R: 2, minConf: 0, rules: OLD },
  { name: "Birinchi versiya, SL 2 ATR, TP 0.5R/1.5R", slMult: 2, tp1R: 0.5, tp2R: 1.5, minConf: 0, rules: OLD },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2).map((a) => {
    const [p, m] = a.split(":");
    return { path: p, minutes: Number(m ?? 5), name: basename(p) };
  });
  const pct = (x: number) => (x * 100).toFixed(0) + "%";
  const rows: string[] = [];
  for (const v of VARIANTS) {
    rows.push(`\n## ${v.name}\n`);
    rows.push("| Taymfreym | Savdolar | Win rate (TP1) | TP2 | O'rtacha R | Profit factor |");
    rows.push("| --- | ---: | ---: | ---: | ---: | ---: |");
    for (const [tf, m, hm] of TFS) {
      const all: Trade[] = [];
      for (const f of files) {
        if (m < f.minutes) continue;
        const all0 = load(f.path);
        // SPLIT=1 yoki SPLIT=2: ma'lumotning faqat birinchi yoki ikkinchi yarmida sinash.
        const half = all0.length >> 1;
        const base = process.env.SPLIT === "1" ? all0.slice(0, half) : process.env.SPLIT === "2" ? all0.slice(half) : all0;
        all.push(...simulate(bucket(base, m), bucket(base, hm), m, hm, v));
      }
      const s = summarize(all);
      if (!s.trades) continue;
      rows.push(`| ${tf} | ${s.trades} | ${pct(s.winRate)} | ${pct(s.tp2Rate)} | ${s.avgR.toFixed(2)} | ${s.profitFactor.toFixed(2)} |`);
    }
  }
  console.log(rows.join("\n"));
}
