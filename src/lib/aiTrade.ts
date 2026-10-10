import type { Candle } from "./types.ts";

// AI treyder qarorining sof mantig'i: tekshirish va natijani shamlar bo'yicha kuzatish.
// Tarmoq va bazaga tegmaydi, shuning uchun testlanadi.

export type AiDecision = { action: "BUY" | "SELL" | "WAIT"; sl?: number | null; tp1?: number | null; tp2?: number | null; confidence?: number; reason?: string };

export type AiPlan = { side: "BUY" | "SELL"; entry: number; sl: number; tp1: number; tp2: number };

// Model javobidan JSON obyektni ajratib oladi (ba'zan ``` ichida yoki matn bilan keladi).
export function parseDecision(text: string): AiDecision | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const action = String(o.action ?? "").toUpperCase();
    if (action !== "BUY" && action !== "SELL" && action !== "WAIT") return null;
    const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
    return {
      action, sl: num(o.sl), tp1: num(o.tp1), tp2: num(o.tp2),
      confidence: Math.max(0, Math.min(100, Math.round(Number(o.confidence) || 0))),
      reason: String(o.reason ?? "").slice(0, 2000),
    };
  } catch {
    return null;
  }
}

// AI darajalarini tekshiradi. Kirish doim joriy narx (AI narxni o'ylab topa olmaydi).
// SL masofasi H1 ATR ning 0.3–3 baravari, TP1 kamida 0.5R, TP2 kamida 1R va TP1 dan uzoqroq bo'lishi kerak.
// Swing rejimida ATR o'rniga D1 ATR beriladi, chegaralar boshqacha: SL 0.3–2 D1 ATR, TP1 kamida 1R, TP2 kamida 2R.
export type PlanLimits = { atrName: string; minAtr: number; maxAtr: number; r1: number; r2: number };
export const INTRADAY_LIMITS: PlanLimits = { atrName: "H1 ATR", minAtr: 0.3, maxAtr: 3, r1: 0.5, r2: 1 };
export const SWING_LIMITS: PlanLimits = { atrName: "D1 ATR", minAtr: 0.3, maxAtr: 2, r1: 1, r2: 2 };

export function validatePlan(d: AiDecision, price: number, atrH1: number, lim: PlanLimits = INTRADAY_LIMITS): { plan?: AiPlan; error?: string } {
  if (d.action === "WAIT") return { error: "kutish" };
  const { sl, tp1, tp2 } = d;
  if (sl == null || tp1 == null || tp2 == null) return { error: "SL yoki TP berilmagan" };
  const dir = d.action === "BUY" ? 1 : -1;
  const risk = (price - sl) * dir;
  if (risk <= 0) return { error: "SL noto'g'ri tomonda" };
  if (atrH1 > 0 && (risk < lim.minAtr * atrH1 || risk > lim.maxAtr * atrH1)) return { error: `SL masofasi ${risk.toFixed(2)} (${lim.atrName} ${atrH1.toFixed(2)}) me'yorda emas` };
  const r1 = ((tp1 - price) * dir) / risk, r2 = ((tp2 - price) * dir) / risk;
  if (r1 < lim.r1) return { error: `TP1 juda yaqin (${r1.toFixed(2)}R)` };
  if (r2 < lim.r2 || r2 <= r1) return { error: `TP2 noto'g'ri (${r2.toFixed(2)}R)` };
  return { plan: { side: d.action, entry: price, sl, tp1, tp2 } };
}

export type AiOutcome = { status: "open" | "tp1" | "tp2" | "sl" | "be" | "trail" | "expired"; resultR: number | null; at: number | null; tp1Hit: boolean };

// Claude ochiq savdoni qayta ko'rib SL ni ko'chirgan payt (t, ms) va yangi SL. Faqat yaqinlashtiriladi (xavf kamayadi).
export type StopMove = { t: number; sl: number };

// Savdo boshqaruvi: TP1 da yarmi yopiladi va SL kirishga ko'chadi; qolgani TP2 yoki kirishda yopiladi.
// Bitta shamda SL va TP birga tegsa, ehtiyot uchun SL birinchi deb olinadi. maxHours dan keyin joriy narxda yopiladi.
// stops: Claude ko'chirgan SL lar, o'sha paytdan keyin ochilgan shamlarga qo'llanadi (agar joriy SL dan yaqinroq bo'lsa).
export function trackPlan(p: AiPlan, openedAt: number, candles: Candle[], maxHours = 24, now = Date.now(), stops: StopMove[] = []): AiOutcome {
  const dir = p.side === "BUY" ? 1 : -1;
  const risk = (p.entry - p.sl) * dir;
  const r1 = ((p.tp1 - p.entry) * dir) / risk, r2 = ((p.tp2 - p.entry) * dir) / risk;
  const rAt = (x: number) => ((x - p.entry) * dir) / risk;
  let tp1Hit = false;
  let last: Candle | null = null;
  for (const c of candles) {
    if (c.t < openedAt) continue;
    last = c;
    const low = dir === 1 ? c.l : -c.h, high = dir === 1 ? c.h : -c.l;
    const base = tp1Hit ? p.entry : p.sl;
    const stop = activeStop(base, dir, stops, c.t);
    if (low <= stop * dir) {
      const r = tp1Hit ? 0.5 * r1 + 0.5 * rAt(stop) : rAt(stop);
      return { status: stop !== base ? "trail" : tp1Hit ? "be" : "sl", resultR: r, at: c.t, tp1Hit };
    }
    if (!tp1Hit && high >= p.tp1 * dir) tp1Hit = true;
    if (tp1Hit && high >= p.tp2 * dir) return { status: "tp2", resultR: 0.5 * r1 + 0.5 * r2, at: c.t, tp1Hit };
  }
  if (last && now - openedAt > maxHours * 3600_000) {
    const open = rAt(last.c);
    return { status: "expired", resultR: tp1Hit ? 0.5 * r1 + 0.5 * open : open, at: last.t, tp1Hit };
  }
  return { status: tp1Hit ? "tp1" : "open", resultR: null, at: null, tp1Hit };
}

// t paytidagi amaldagi SL: asosiy SL (yoki TP1 dan keyin kirish) va Claude ko'chirganlarining eng yaqini.
export function activeStop(base: number, dir: number, stops: StopMove[], t = Infinity): number {
  let stop = base;
  for (const s of stops) if (s.t <= t && (s.sl - stop) * dir > 0) stop = s.sl;
  return stop;
}

// Hozir yopilsa natija (R): TP1 urilgan bo'lsa yarmi TP1 da yopilgan.
export function resultAt(p: AiPlan, price: number, tp1Hit: boolean): number {
  const dir = p.side === "BUY" ? 1 : -1;
  const risk = (p.entry - p.sl) * dir;
  const r1 = ((p.tp1 - p.entry) * dir) / risk, now = ((price - p.entry) * dir) / risk;
  return tp1Hit ? 0.5 * r1 + 0.5 * now : now;
}

// Pips: oltinda 1 pip = 0.10 $, JPY juftliklarida 0.01, boshqa valyutalarda 0.0001.
// Kriptoda (2026-10-10): BTC 1 $, ETH 0.1 $, SOL va BNB 0.01 $, XRP 0.0001 $ (narxga nisbatan taxminan bir xil ulush).
const CRYPTO_PIP: Record<string, number> = { "BTC/USDT": 1, "ETH/USDT": 0.1, "SOL/USDT": 0.01, "BNB/USDT": 0.01, "XRP/USDT": 0.0001 };
export const pipSize = (pair: string) => (pair === "XAU/USD" ? 0.1 : CRYPTO_PIP[pair] ?? (pair.includes("JPY") ? 0.01 : 0.0001));
export const toPips = (pair: string, diff: number) => diff / pipSize(pair);

// Ochiq savdoni qayta ko'rish qarori: ushlab turish, SL ni ko'chirish yoki hozir yopish.
export type ReviewAction = "HOLD" | "MOVE_SL" | "CLOSE";
export type AiReviewDecision = { action: ReviewAction; newSl: number | null; confidence: number; reason: string };

export function parseReview(text: string): AiReviewDecision | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const action = String(o.action ?? "").toUpperCase();
    if (action !== "HOLD" && action !== "MOVE_SL" && action !== "CLOSE") return null;
    const sl = Number(o.new_sl);
    return {
      action, newSl: action === "MOVE_SL" && Number.isFinite(sl) && sl > 0 ? sl : null,
      confidence: Math.max(0, Math.min(100, Math.round(Number(o.confidence) || 0))),
      reason: String(o.reason ?? "").slice(0, 2000),
    };
  } catch {
    return null;
  }
}

// Yangi SL faqat xavfni kamaytirsa qabul qilinadi: joriy SL dan yaqinroq va joriy narxdan kamida minGap (masalan 0.2 ATR) narida.
export function validateStopMove(side: "BUY" | "SELL", current: number, newSl: number, price: number, minGap: number): string | null {
  const dir = side === "BUY" ? 1 : -1;
  if ((newSl - current) * dir <= 0) return "yangi SL joriy SL dan yaqin emas (faqat xavfni kamaytirish mumkin)";
  if ((price - newSl) * dir < minGap) return "yangi SL narxga juda yaqin";
  return null;
}
