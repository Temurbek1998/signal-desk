import { adx, atr, ema, macd, rsi } from "./indicators.ts";
import type { Candle, Category, Side, Signal, Timeframe } from "./types.ts";

// Signal robotining qoidalari.
//
// Trend:    EMA20 va EMA50 joylashuvi, narx EMA50 ning qaysi tomonida.
// Kirish:   trend ichidagi pullback tugashi: RSI 45 dan pastga tushib qaytgan (SELL uchun 55 teskari).
// Filtr:    ADX ≥ 20 (bozorda trend bor) va yuqori taymfreym trendi bir xil yo'nalishda.
// Daraja:   SL = kirish ± 2 × ATR, TP1 = 0.5R, TP2 = 1.5R.
// Bu sozlamalar scripts/backtest.ts dagi sinovlar asosida tanlangan, BACKTEST.md ga qarang.

export const MIN_CANDLES = 60;
const CROSS_LOOKBACK = 3;

export type Analysis = {
  trend: "up" | "down" | "flat";
  rsi: number;
  atr: number;
  close: number;
  crossUp: boolean;
  crossDown: boolean;
  ema20: number;
  ema50: number;
  adx: number;
  rsiPrev: number[]; // oldingi 3 shamdagi RSI (eng yangisi oxirida)
  time: number;
};

export type Rules = {
  mode: "macd" | "pullback"; // impuls (MACD kesishuvi) yoki trend ichidagi pullback
  minAdx: number; // 0 = ADX filtri o'chiq
  requireHigher: boolean; // yuqori taymfreym trendi majburiy mos kelishi kerak
  maxFeeR?: number; // komissiya riskning shu ulushidan oshsa signal berilmaydi (0 yoki yo'q = o'chiq)
};
// maxFeeR 0.05: sinovda robotning o'rtacha ustunligi savdo boshiga ~0.06R, shuning uchun xarajati bundan
// katta bo'lgan savdo kutilgan zarar beradi. ROBOT_MAX_FEE_R bilan o'zgartirish mumkin (0 = o'chiq).
const rawFee = typeof process !== "undefined" ? process.env?.ROBOT_MAX_FEE_R?.trim() : undefined;
const envFee = rawFee ? Number(rawFee) : NaN;
export const DEFAULT_RULES: Rules = { mode: "pullback", minAdx: 20, requireHigher: true, maxFeeR: Number.isFinite(envFee) && envFee >= 0 ? envFee : 0.05 };

// Taxminiy bir tomonlama savdo xarajati (komissiya yoki spred), narxga nisbatan foizda.
// Kripto: birja taker komissiyasi; oltin va forex: odatiy spred.
export const FEE_PCT: Record<Category, number> = { crypto: 0.04, gold: 0.01, forex: 0.005 };

// Kirish va chiqish xarajati risk birligida (R). SL qanchalik yaqin bo'lsa, xarajat shunchalik katta ulush oladi.
export const feeR = (category: Category, price: number, risk: number) => (2 * FEE_PCT[category]) / 100 / (risk / price);
export const SL_ATR = 2;
// Oltinda SL kengroq: tarixiy sinovda (GOLD_BACKTEST.md) 2.5 ATR ikkala yarim davrda ham 2 ATR dan yaxshi chiqdi.
export const SL_ATR_BY_CATEGORY: Record<Category, number> = { crypto: SL_ATR, gold: 2.5, forex: SL_ATR };
export const TP1_R = 0.5;
export const TP2_R = 1.5;

export function analyze(candles: Candle[]): Analysis | null {
  if (candles.length < MIN_CANDLES) return null;
  const closes = candles.map((c) => c.c);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const r = rsi(closes, 14);
  const m = macd(closes);
  const a = atr(candles, 14);
  const ax = adx(candles, 14);
  const i = candles.length - 1;
  const close = closes[i];

  let trend: Analysis["trend"] = "flat";
  if (e20[i] > e50[i] && close > e50[i]) trend = "up";
  else if (e20[i] < e50[i] && close < e50[i]) trend = "down";

  let crossUp = false;
  let crossDown = false;
  for (let j = i; j > i - CROSS_LOOKBACK && j > 0; j--) {
    if (m.hist[j - 1] <= 0 && m.hist[j] > 0) crossUp = true;
    if (m.hist[j - 1] >= 0 && m.hist[j] < 0) crossDown = true;
  }
  // Oxirgi shamdagi holat ustun turadi.
  if (crossUp && crossDown) {
    crossUp = m.hist[i] > 0;
    crossDown = m.hist[i] < 0;
  }

  return {
    trend, rsi: r[i], atr: a[i], close, crossUp, crossDown, ema20: e20[i], ema50: e50[i],
    adx: ax[i], rsiPrev: [r[i - 3], r[i - 2], r[i - 1]], time: candles[i].t,
  };
}

export function generateSignal(
  pair: string,
  category: Category,
  timeframe: Timeframe,
  candles: Candle[],
  higher?: Analysis | null,
  rules: Rules = DEFAULT_RULES,
): Signal | null {
  const a = analyze(candles);
  if (!a) return null;

  let side: Side | null = null;
  const reasons: string[] = [];
  let rejected: string | null = null; // signal nima uchun berilmagani (admin jurnali uchun)

  if (rules.mode === "macd") {
    if (a.trend === "up" && a.crossUp && a.rsi > 50 && a.rsi < 70) side = "BUY";
    else if (a.trend === "down" && a.crossDown && a.rsi < 50 && a.rsi > 30) side = "SELL";
    else rejected = a.trend === "flat" ? "Aniq trend yo'q" : "MACD kesishuvi kutilmoqda";
  } else {
    // Pullback: trend ichida RSI 45 dan pastga tushib, yana yuqoriga qaytdi (SELL uchun 55 teskari).
    const dippedBelow = a.rsiPrev.some((v) => v < 45);
    const poppedAbove = a.rsiPrev.some((v) => v > 55);
    if (a.trend === "up" && dippedBelow && a.rsi >= 45 && a.rsi < 65) side = "BUY";
    else if (a.trend === "down" && poppedAbove && a.rsi <= 55 && a.rsi > 35) side = "SELL";
    if (side) reasons.push("Trend ichidagi pullback tugadi (RSI qaytdi)");
    else if (a.trend === "flat") rejected = "Aniq trend yo'q (EMA20 va EMA50 aralash)";
    else rejected = `Trend ${a.trend === "up" ? "yuqoriga, BUY" : "pastga, SELL"} uchun pullback kutilmoqda (RSI ${a.rsi.toFixed(0)})`;
  }
  if (side && rules.minAdx && !(a.adx >= rules.minAdx)) {
    rejected = `${side} setup bor, lekin trend kuchsiz (ADX ${a.adx.toFixed(1)} < ${rules.minAdx})`;
    side = null;
  }
  if (side && rules.requireHigher) {
    const want = side === "BUY" ? "up" : "down";
    if (higher?.trend !== want) {
      rejected = `${side} setup bor, lekin yuqori taymfreym trendi ${higher ? (higher.trend === "flat" ? "aniq emas" : "qarshi") : "noma'lum"}`;
      side = null;
    }
  }
  if (side && rules.maxFeeR) {
    // Past volatillikda TP1 foydasining katta qismini komissiya yeydi: bunday signal berilmaydi.
    const f = feeR(category, a.close, a.atr * SL_ATR_BY_CATEGORY[category]);
    if (f > rules.maxFeeR) {
      rejected = `${side} setup bor, lekin harakat kichik: komissiya riskning ${Math.round(f * 100)}% ini oladi`;
      side = null;
    }
  }
  if (!Number.isNaN(a.adx)) reasons.push(`ADX ${a.adx.toFixed(0)}`);

  if (a.trend === "up") reasons.push("EMA20 > EMA50, trend yuqoriga");
  else if (a.trend === "down") reasons.push("EMA20 < EMA50, trend pastga");
  else reasons.push("Aniq trend yo'q");
  if (a.crossUp) reasons.push("MACD yuqoriga kesib o'tdi");
  if (a.crossDown) reasons.push("MACD pastga kesib o'tdi");
  reasons.push(`RSI ${a.rsi.toFixed(0)}`);

  let confidence = 0;
  let sl: number | null = null;
  let tp1: number | null = null;
  let tp2: number | null = null;

  if (side) {
    const dir = side === "BUY" ? 1 : -1;
    const risk = a.atr * SL_ATR_BY_CATEGORY[category];
    sl = a.close - dir * risk;
    tp1 = a.close + dir * risk * TP1_R;
    tp2 = a.close + dir * risk * TP2_R;

    confidence = 50;
    // Trend kuchi: EMA'lar orasidagi masofa ATR ga nisbatan.
    const spread = Math.abs(a.ema20 - a.ema50) / a.atr;
    confidence += Math.min(15, Math.round(spread * 10));
    // RSI "sog'lom" zonada (BUY uchun 55-65, SELL uchun 35-45) bo'lsa qo'shimcha ball.
    const rsiMid = side === "BUY" ? 60 : 40;
    confidence += Math.max(0, 10 - Math.round(Math.abs(a.rsi - rsiMid)));
    if (higher) {
      const agree = (side === "BUY" && higher.trend === "up") || (side === "SELL" && higher.trend === "down");
      const against = (side === "BUY" && higher.trend === "down") || (side === "SELL" && higher.trend === "up");
      if (agree) {
        confidence += 20;
        reasons.push("Yuqori taymfreym trendi tasdiqlaydi");
      } else if (against) {
        confidence -= 20;
        reasons.push("Yuqori taymfreym trendi qarshi");
      }
    }
    confidence = Math.max(5, Math.min(95, confidence));
  }

  return {
    pair,
    category,
    timeframe,
    side,
    entry: a.close,
    tp1,
    tp2,
    sl,
    confidence,
    reasons,
    rsi: a.rsi,
    trend: a.trend,
    candleTime: a.time,
    price: a.close,
    status: side ? "active" : null,
    barsAgo: 0,
    rejected,
  };
}

// So'nggi `lookback` sham ichidagi eng yangi signalni topadi va undan keyingi
// shamlarda TP yoki SL ga yetganini tekshiradi. Signal bo'lmasa joriy tahlilni qaytaradi.
export const LOOKBACK = 40;

// Chiqish boshqaruvi (faqat oltin). Tarixiy sinov (GOLD_BACKTEST.md, "Chiqish qoidalari"): TP1 dan keyin SL ni kirishga
// qo'yish o'rniga narx ortidan 1 ATR masofada ergashtirish va 8 soatdan keyin yopish natijani ikkala yarim davrda ham yaxshiladi.
export type ExitRule = { trailAtr: number; maxBars: number };
export const EXIT_BY_CATEGORY: Partial<Record<Category, ExitRule>> = { gold: { trailAtr: 1, maxBars: 32 } };

// Signal ochilgandan keyingi shamlar bo'yicha natija. Tartib sinovdagidek: avval SL, keyin TP1, TP2, so'ng SL ergashadi, oxirida vaqt.
export function walkTrailing(s: Signal, after: Candle[], rule: ExitRule, slAtr: number) {
  const d = s.side === "BUY" ? 1 : -1;
  const risk = Math.abs(s.entry - s.sl!);
  const atr = risk / slAtr;
  let stop = s.sl!, best = s.entry, tp1Hit = false;
  const half = 0.5 * TP1_R;
  for (let i = 0; i < after.length; i++) {
    const c = after[i];
    const lo = d > 0 ? c.l : c.h, hi = d > 0 ? c.h : c.l;
    if ((lo - stop) * d <= 0) {
      const part = ((stop - s.entry) * d) / risk;
      return tp1Hit
        ? { status: (part > 0 ? "tp1" : "sl") as Signal["status"], resultR: half + 0.5 * part, tp1Hit, stop }
        : { status: "sl" as Signal["status"], resultR: -1, tp1Hit, stop };
    }
    if (!tp1Hit && (hi - s.tp1!) * d >= 0) tp1Hit = true;
    if (tp1Hit && (hi - s.tp2!) * d >= 0) return { status: "tp2" as Signal["status"], resultR: half + 0.5 * TP2_R, tp1Hit, stop };
    if ((hi - best) * d > 0) best = hi;
    if (tp1Hit) {
      const trail = best - d * rule.trailAtr * atr;
      if ((trail - stop) * d > 0) stop = trail;
    }
    if (i + 1 >= rule.maxBars) {
      const open = ((c.c - s.entry) * d) / risk;
      return { status: "close" as Signal["status"], resultR: tp1Hit ? half + 0.5 * open : open, tp1Hit, stop };
    }
  }
  return { status: "active" as Signal["status"], resultR: null, tp1Hit, stop };
}

export function latestSignal(
  pair: string,
  category: Category,
  timeframe: Timeframe,
  candles: Candle[],
  higher?: Analysis | null,
  lookback = LOOKBACK,
  rules: Rules = DEFAULT_RULES,
): Signal | null {
  const current = generateSignal(pair, category, timeframe, candles, higher, rules);
  if (!current || current.side) return current;
  const last = candles[candles.length - 1].c;

  for (let n = candles.length - 1; n >= Math.max(MIN_CANDLES, candles.length - lookback); n--) {
    const s = generateSignal(pair, category, timeframe, candles.slice(0, n), higher, rules);
    if (!s?.side) continue;
    const buy = s.side === "BUY";
    let status: Signal["status"] = "active";
    const exit = EXIT_BY_CATEGORY[category];
    if (exit) {
      // Oltin: TP1 da yarmi yopiladi, qolgani narx ortidan ergashuvchi SL bilan boshqariladi (scripts/gold-exits.ts).
      const o = walkTrailing(s, candles.slice(n), exit, SL_ATR_BY_CATEGORY[category]);
      return { ...s, status: o.status, resultR: o.resultR, tp1Hit: o.tp1Hit, trailStop: o.stop, barsAgo: candles.length - n, price: last };
    }
    for (const c of candles.slice(n)) {
      const hitSl = buy ? c.l <= s.sl! : c.h >= s.sl!;
      const hitTp1 = buy ? c.h >= s.tp1! : c.l <= s.tp1!;
      const hitTp2 = buy ? c.h >= s.tp2! : c.l <= s.tp2!;
      // Bitta shamda ham SL, ham TP bo'lsa, ehtiyotkorlik bilan SL deb hisoblanadi.
      if (status === "active" && hitSl) { status = "sl"; break; }
      // TP1 dan keyin SL kirish narxiga ko'chiriladi: narx qaytsa natija TP1 bo'lib qoladi.
      if (status === "tp1" && (buy ? c.l <= s.entry : c.h >= s.entry)) break;
      if (hitTp2) { status = "tp2"; break; }
      if (hitTp1) status = "tp1";
    }
    return { ...s, status, barsAgo: candles.length - n, price: last };
  }
  return current;
}

// "Kuchli signal" sharti. Tarixiy sinovda (BACKTEST.md) faqat M15 va M30 ikkala davrda ham
// ijobiy chiqdi; M30 da ishonch >= 75% filtri win rate'ni yanada oshirdi, M15 da esa oshirmadi.
// M5 va H1 signallari hamda muhim yangilik oldidagi signallar kuchsiz hisoblanadi.
export const STRONG_MIN_CONFIDENCE: Partial<Record<Timeframe, number>> = { M15: 0, M30: 75 };

// Oltin tarixiy sinovida (2026-iyun – oktabr) M30 ham, H1 ham zarar berdi: oltinda faqat M15 kuchli.
export const GOLD_STRONG_TF: Timeframe[] = ["M15"];

type Q = Pick<Signal, "side" | "timeframe" | "confidence"> & { category?: Category };

export function quality(s: Q, newsRisk: boolean): "strong" | "weak" {
  return weakReason(s, newsRisk) ? "weak" : "strong";
}

// Signal nega kuchsiz hisoblangani; kuchli bo'lsa null.
export function weakReason(s: Q, newsRisk: boolean): string | null {
  if (!s.side) return "Signal yo'q";
  if (s.category === "gold" && !GOLD_STRONG_TF.includes(s.timeframe)) return `Oltinda ${s.timeframe} tarixiy sinovda zarar bergan, faqat adminga ko'rinadi`;
  const min = STRONG_MIN_CONFIDENCE[s.timeframe];
  if (min === undefined) return `${s.timeframe} taymfreymi tarixiy sinovda zaif, faqat adminga ko'rinadi`;
  if (s.confidence < min) return `Ishonch ${s.confidence}% < ${min}%`;
  if (newsRisk) return "Yaqin orada muhim yangilik";
  return null;
}
