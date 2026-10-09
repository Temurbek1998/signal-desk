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
export function validatePlan(d: AiDecision, price: number, atrH1: number): { plan?: AiPlan; error?: string } {
  if (d.action === "WAIT") return { error: "kutish" };
  const { sl, tp1, tp2 } = d;
  if (sl == null || tp1 == null || tp2 == null) return { error: "SL yoki TP berilmagan" };
  const dir = d.action === "BUY" ? 1 : -1;
  const risk = (price - sl) * dir;
  if (risk <= 0) return { error: "SL noto'g'ri tomonda" };
  if (atrH1 > 0 && (risk < 0.3 * atrH1 || risk > 3 * atrH1)) return { error: `SL masofasi ${risk.toFixed(2)} (H1 ATR ${atrH1.toFixed(2)}) me'yorda emas` };
  const r1 = ((tp1 - price) * dir) / risk, r2 = ((tp2 - price) * dir) / risk;
  if (r1 < 0.5) return { error: `TP1 juda yaqin (${r1.toFixed(2)}R)` };
  if (r2 < 1 || r2 <= r1) return { error: `TP2 noto'g'ri (${r2.toFixed(2)}R)` };
  return { plan: { side: d.action, entry: price, sl, tp1, tp2 } };
}

export type AiOutcome = { status: "open" | "tp1" | "tp2" | "sl" | "be" | "expired"; resultR: number | null; at: number | null; tp1Hit: boolean };

// Savdo boshqaruvi: TP1 da yarmi yopiladi va SL kirishga ko'chadi; qolgani TP2 yoki kirishda yopiladi.
// Bitta shamda SL va TP birga tegsa, ehtiyot uchun SL birinchi deb olinadi. maxHours dan keyin joriy narxda yopiladi.
export function trackPlan(p: AiPlan, openedAt: number, candles: Candle[], maxHours = 24, now = Date.now()): AiOutcome {
  const dir = p.side === "BUY" ? 1 : -1;
  const risk = (p.entry - p.sl) * dir;
  const r1 = ((p.tp1 - p.entry) * dir) / risk, r2 = ((p.tp2 - p.entry) * dir) / risk;
  let tp1Hit = false;
  let last: Candle | null = null;
  for (const c of candles) {
    if (c.t < openedAt) continue;
    last = c;
    const low = dir === 1 ? c.l : -c.h, high = dir === 1 ? c.h : -c.l;
    const stop = tp1Hit ? p.entry * dir : p.sl * dir;
    if (low <= stop) return tp1Hit ? { status: "be", resultR: 0.5 * r1, at: c.t, tp1Hit } : { status: "sl", resultR: -1, at: c.t, tp1Hit };
    if (!tp1Hit && high >= p.tp1 * dir) tp1Hit = true;
    if (tp1Hit && high >= p.tp2 * dir) return { status: "tp2", resultR: 0.5 * r1 + 0.5 * r2, at: c.t, tp1Hit };
  }
  if (last && now - openedAt > maxHours * 3600_000) {
    const open = ((last.c - p.entry) * dir) / risk;
    return { status: "expired", resultR: tp1Hit ? 0.5 * r1 + 0.5 * open : open, at: last.t, tp1Hit };
  }
  return { status: tp1Hit ? "tp1" : "open", resultR: null, at: null, tp1Hit };
}
