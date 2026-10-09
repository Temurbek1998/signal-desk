// Oltin uchun fiks pips maqsadli rejim (GOLD_BACKTEST.md, "300–400 pips" bo'limi). Sof funksiyalar.
// Ikki strategiya, ikkalasi ham M15 shamlarda, SL 200 pips:
//  - pips-pullback: trend ichidagi pullback (ADX va yuqori taymfreym filtrisiz), TP 300 pips;
//  - pips-london: 00:00–07:00 UTC oralig'i 07:00–13:00 orasida yorib o'tilsa, TP 400 pips.
// Har kuni 20:45 UTC da ochiq savdo yopiladi (21:00 da bozor yopiladi), shuning uchun har bir savdo kuni mustaqil.
import { analyze, DEFAULT_RULES, generateSignal, MIN_CANDLES, type Rules } from "./engine.ts";
import type { Candle, Side, Signal, Strategy } from "./types.ts";

export const PIP = 0.1; // oltinda 1 pip = 0.10 USD
export const PIPS_SL = 200;
export const PIPS_TP: Record<"pips-pullback" | "pips-london", number> = { "pips-pullback": 300, "pips-london": 400 };
export const LOOSE_RULES: Rules = { ...DEFAULT_RULES, minAdx: 0, requireHigher: false, maxFeeR: 0 };

const M15 = 15 * 60_000;
const DAY = 86_400_000;
export const hourOf = (t: number) => { const d = new Date(t); return d.getUTCHours() + d.getUTCMinutes() / 60; };
// Savdo kuni 22:00 UTC da boshlanadi va keyingi kun 21:00 da tugaydi.
export const tradingDay = (t: number) => Math.floor((t + 2 * 3600_000) / DAY);
// Sham yopilgan vaqt 20:45–22:00 UTC orasida bo'lsa: kun oxiri, yangi savdo ochilmaydi, ochig'i yopiladi.
export const isDayEnd = (closeTime: number) => { const h = hourOf(closeTime); return h >= 20.75 && h < 22; };

export type Track = { status: Exclude<Signal["status"], null>; resultR: number | null; end: number };

// Kirishdan keyin TP yoki SL gacha kuzatadi. Bir shamda ikkalasi bo'lsa SL. Kun oxirida (yoki savdo kuni
// almashganda, masalan ma'lumot uzilsa) oxirgi yopilish narxida yopiladi.
// barMs: sham uzunligi (M15 yoki Gerakl uchun M5); maxBars: vaqt to'xtashi (shuncha shamdan keyin yopiladi).
export function trackFixed(c: Candle[], i: number, side: Side, entry: number, sl: number, tp: number, barMs = M15, maxBars = Infinity): Track {
  const dir = side === "BUY" ? 1 : -1;
  const risk = Math.abs(entry - sl);
  const day = tradingDay(c[i].t + barMs);
  for (let j = i + 1; j < c.length; j++) {
    const x = c[j];
    if (tradingDay(x.t + barMs) !== day) return { status: "close", resultR: (dir * (c[j - 1].c - entry)) / risk, end: j - 1 };
    if (dir > 0 ? x.l <= sl : x.h >= sl) return { status: "sl", resultR: -1, end: j };
    if (dir > 0 ? x.h >= tp : x.l <= tp) return { status: "tp2", resultR: Math.abs(tp - entry) / risk, end: j };
    if (isDayEnd(x.t + barMs) || j - i >= maxBars) return { status: "close", resultR: (dir * (x.c - entry)) / risk, end: j };
  }
  return { status: "active", resultR: null, end: c.length };
}

function build(pair: string, strategy: "pips-pullback" | "pips-london", c: Candle[], n: number, side: Side, reasons: string[]): [Signal, number] {
  const a = analyze(c.slice(Math.max(0, n - 199), n + 1));
  const dir = side === "BUY" ? 1 : -1;
  const entry = c[n].c;
  const sl = entry - dir * PIPS_SL * PIP;
  const tp = entry + dir * PIPS_TP[strategy] * PIP;
  const t = trackFixed(c, n, side, entry, sl, tp);
  return [{
    pair, category: "gold", timeframe: "M15", strategy, side, entry, tp1: tp, tp2: tp, sl,
    confidence: 50,
    reasons: [...reasons, `Maqsad ${PIPS_TP[strategy]} pips, SL ${PIPS_SL} pips`],
    rsi: a?.rsi ?? 50, trend: a?.trend ?? "flat",
    candleTime: c[n].t, price: c.at(-1)!.c, status: t.status, resultR: t.resultR,
    barsAgo: c.length - 1 - n, quality: "strong",
  }, t.end];
}

// Kirish mumkin bo'lgan sham: kun oxiri emas va ma'lumot yetarli.
const canEnter = (c: Candle[], n: number) => n >= MIN_CANDLES && !isDayEnd(c[n].t + M15);

// Savdolar ketma-ket: ochiq savdo yopilmaguncha yangisi ochilmaydi (tarixiy sinovdagidek).
export function pipsPullback(pair: string, c: Candle[], from: number): Signal[] {
  const out: Signal[] = [];
  let busy = -1;
  for (let n = from; n < c.length; n++) {
    if (n <= busy || !canEnter(c, n)) continue;
    const s = generateSignal(pair, "gold", "M15", c.slice(Math.max(0, n - 199), n + 1), null, LOOSE_RULES);
    if (!s?.side) continue;
    const [sig, end] = build(pair, "pips-pullback", c, n, s.side, ["Trend ichidagi pullback tugadi (RSI qaytdi)", s.trend === "up" ? "EMA20 > EMA50" : "EMA20 < EMA50"]);
    out.push(sig);
    busy = end;
  }
  return out;
}

// Kuniga bitta savdo: 00:00–06:45 UTC dagi kamida 12 ta M15 sham oralig'i, 07:00–12:45 dagi birinchi yopilish oraliqdan chiqsa.
export function londonBreakout(pair: string, c: Candle[], from: number): Signal[] {
  const out: Signal[] = [];
  const byDay = new Map<number, number[]>();
  c.forEach((x, i) => { const d = Math.floor(x.t / DAY); byDay.set(d, [...(byDay.get(d) ?? []), i]); });
  for (const idx of byDay.values()) {
    const rng = idx.filter((i) => new Date(c[i].t).getUTCHours() < 7);
    if (rng.length < 12) continue;
    const hi = Math.max(...rng.map((i) => c[i].h));
    const lo = Math.min(...rng.map((i) => c[i].l));
    for (const n of idx) {
      const h = new Date(c[n].t).getUTCHours();
      if (h < 7 || h >= 13) continue;
      const side: Side | null = c[n].c > hi ? "BUY" : c[n].c < lo ? "SELL" : null;
      if (!side) continue;
      if (n >= from && canEnter(c, n)) {
        out.push(build(pair, "pips-london", c, n, side, [
          `London ochilishi: tungi oraliq ${lo.toFixed(2)}–${hi.toFixed(2)} ${side === "BUY" ? "yuqoriga" : "pastga"} yorib o'tildi`,
          `Oraliq kengligi ${Math.round((hi - lo) / PIP)} pips`,
        ])[0]);
      }
      break;
    }
  }
  return out;
}

// Joriy va oldingi savdo kunidagi barcha pips signallari (ochiq va yopilgan), jurnal va demo hisob uchun.
// Har bir savdo kuni mustaqil bo'lgani uchun natija qaysi shamdan boshlab hisoblanishiga bog'liq emas.
export function pipsSignals(pair: string, c: Candle[], now = Date.now()): Signal[] {
  if (c.length <= MIN_CANDLES) return [];
  const startDay = tradingDay(now) - 1;
  let from = c.findIndex((x) => tradingDay(x.t + M15) >= startDay);
  if (from < 0) return [];
  from = Math.max(from, MIN_CANDLES);
  return [...pipsPullback(pair, c, from), ...londonBreakout(pair, c, from)].sort((a, b) => a.candleTime - b.candleTime);
}
