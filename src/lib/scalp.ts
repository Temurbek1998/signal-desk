// Gerakl: oltin uchun skalping va razgon (keskin impuls) roboti. Sof funksiyalar.
// Qoida (scripts/gold-scalp.ts, GOLD_BACKTEST.md "Gerakl" bo'limi): M5 shami tanasi oldingi ATR(14) ning
// kamida 3 baravari va yopilish shamning chetida (25% ichida) bo'lsa, impuls yo'nalishida kiriladi.
// SL 80 pips, TP 150 pips, 2 soatdan keyin (24 sham) yoki kun oxirida (20:45 UTC) yopiladi.
import { MIN_CANDLES } from "./engine.ts";
import { atr } from "./indicators.ts";
import { isDayEnd, PIP, trackFixed, tradingDay } from "./pips.ts";
import type { Candle, Side, Signal } from "./types.ts";

// Gerakl yoqilganmi. Bek qarori: hozircha o'chiq; GERAKL_ENABLED=1 qilinsa qayta yoqiladi.
// O'chiq bo'lsa yangi savdo ochilmaydi, ochiq qolgan savdolar esa o'z qoidasi bo'yicha yopilguncha kuzatiladi.
export const geraklEnabled = (env = process.env) => env.GERAKL_ENABLED === "1";

export const SCALP = { burstAtr: 3, edge: 0.25, slPips: 80, tpPips: 150, maxBars: 24 } as const;
const M5 = 5 * 60_000;

// i-sham razgon shamimi: BUY, SELL yoki null.
export function burstSide(c: Candle[], i: number, a: number[]): Side | null {
  const x = c[i], body = x.c - x.o, range = x.h - x.l;
  if (!(a[i - 1] > 0) || range <= 0 || Math.abs(body) < SCALP.burstAtr * a[i - 1]) return null;
  if (body > 0) return (x.h - x.c) / range < SCALP.edge ? "BUY" : null;
  return (x.c - x.l) / range < SCALP.edge ? "SELL" : null;
}

// Joriy va oldingi savdo kunidagi Gerakl signallari (ochiq va yopilgan). Ochiq savdo yopilmaguncha yangisi ochilmaydi.
export function scalpSignals(pair: string, c: Candle[], now = Date.now()): Signal[] {
  if (c.length <= MIN_CANDLES) return [];
  const a = atr(c, 14);
  const startDay = tradingDay(now) - 1;
  const from = Math.max(MIN_CANDLES, c.findIndex((x) => tradingDay(x.t + M5) >= startDay));
  if (from < 0) return [];
  const out: Signal[] = [];
  let busy = -1;
  for (let n = from; n < c.length; n++) {
    if (n <= busy || isDayEnd(c[n].t + M5)) continue;
    const side = burstSide(c, n, a);
    if (!side) continue;
    const dir = side === "BUY" ? 1 : -1;
    const entry = c[n].c;
    const sl = entry - dir * SCALP.slPips * PIP;
    const tp = entry + dir * SCALP.tpPips * PIP;
    const t = trackFixed(c, n, side, entry, sl, tp, M5, SCALP.maxBars);
    out.push({
      pair, category: "gold", timeframe: "M5", strategy: "scalp-razgon", side, entry, tp1: tp, tp2: tp, sl,
      confidence: 50,
      reasons: [
        `Razgon: M5 shami ${(Math.abs(c[n].c - c[n].o) / PIP).toFixed(0)} pips, o'rtacha harakatdan (ATR) ${(Math.abs(c[n].c - c[n].o) / a[n - 1]).toFixed(1)} baravar katta`,
        `Maqsad ${SCALP.tpPips} pips, SL ${SCALP.slPips} pips, 2 soatdan keyin yopiladi`,
      ],
      rsi: 50, trend: side === "BUY" ? "up" : "down",
      candleTime: c[n].t, price: c.at(-1)!.c, status: t.status, resultR: t.resultR,
      barsAgo: c.length - 1 - n, quality: "strong",
    });
    busy = t.end;
  }
  return out;
}
