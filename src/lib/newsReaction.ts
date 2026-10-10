// Yangilik chiqqandan keyingi M1 reaksiyasi (sof funksiyalar, sinash oson): narx harakati, Claude javobini o'qish
// va natijani o'lchash. Server qismi: server/newsTrader.ts.
import { pipSize, toPips } from "./aiTrade.ts";
import type { Candle } from "./types.ts";

export type NewsStats = {
  base: number; // chiqishdan oldingi oxirgi M1 yopilishi
  price: number; // hozirgi (oxirgi yopilgan M1)
  minutes: number; // chiqqandan beri nechta M1 sham
  firstMinPips: number; // birinchi daqiqa harakati
  movePips: number; // chiqqandan beri jami harakat
  upPips: number; // eng yuqori nuqta, chiqishdan oldingi narxdan
  downPips: number; // eng past nuqta
  preRangePips: number; // chiqishdan oldingi 30 daqiqa diapazoni
};

const r1 = (x: number) => Math.round(x * 10) / 10;

export function reactionStats(pair: string, m1: Candle[], releaseAt: number): NewsStats | null {
  const before = m1.filter((c) => c.t < releaseAt);
  const after = m1.filter((c) => c.t >= releaseAt);
  if (!before.length || !after.length) return null;
  const base = before.at(-1)!.c;
  const pre = before.slice(-30);
  const hi = Math.max(...after.map((c) => c.h)), lo = Math.min(...after.map((c) => c.l));
  const price = after.at(-1)!.c;
  return {
    base, price, minutes: after.length,
    firstMinPips: r1(toPips(pair, after[0].c - base)),
    movePips: r1(toPips(pair, price - base)),
    upPips: r1(toPips(pair, hi - base)),
    downPips: r1(toPips(pair, base - lo)),
    preRangePips: r1(toPips(pair, Math.max(...pre.map((c) => c.h)) - Math.min(...pre.map((c) => c.l)))),
  };
}

export type NewsCall = {
  direction: "BUY" | "SELL" | "WAIT"; confidence: number; targetPips: number; invalidation: number | null;
  horizonMin: number; entry: string; reason: string;
};

export function parseNewsCall(text: string): NewsCall | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]);
    const direction = String(o.direction ?? "").toUpperCase();
    if (direction !== "BUY" && direction !== "SELL" && direction !== "WAIT") return null;
    const target = Math.abs(Number(o.target_pips) || 0);
    const inv = Number(o.invalidation);
    return {
      direction,
      confidence: Math.max(0, Math.min(100, Math.round(Number(o.confidence) || 0))),
      targetPips: direction === "WAIT" ? 0 : Math.round(target),
      invalidation: direction !== "WAIT" && Number.isFinite(inv) && inv > 0 ? inv : null,
      horizonMin: Math.max(15, Math.min(240, Math.round(Number(o.horizon_min) || 60))),
      entry: String(o.entry ?? "").slice(0, 500),
      reason: String(o.reason ?? "").slice(0, 3000),
    };
  } catch {
    return null;
  }
}

// Bekor bo'lish narxi noto'g'ri tomonda bo'lsa olib tashlanadi (BUY uchun narxdan past, SELL uchun yuqori bo'lishi kerak).
export function checkInvalidation(c: NewsCall, price: number): number | null {
  if (c.invalidation == null || c.direction === "WAIT") return null;
  const dir = c.direction === "BUY" ? 1 : -1;
  return (price - c.invalidation) * dir > 0 ? c.invalidation : null;
}

export type NewsOutcome = { status: "open" | "target" | "stop" | "expired"; resultPips: number | null; mfePips: number; maePips: number };

// Natija: kirish (tahlil paytidagi narx) dan keyingi shamlar bo'yicha. Maqsad yoki bekor narxi urilsa yopiladi,
// aks holda muddat oxirida oxirgi yopilish bo'yicha. Bir shamda ikkalasi urilsa ehtiyot uchun bekor deb olinadi.
export function newsOutcome(
  pair: string, side: "BUY" | "SELL", entry: number, targetPips: number, invalidation: number | null,
  candles: Candle[], from: number, horizonMin: number, barMs: number, now = Date.now(),
): NewsOutcome {
  const dir = side === "BUY" ? 1 : -1;
  const target = entry + dir * targetPips * pipSize(pair);
  const end = from + horizonMin * 60_000;
  let mfe = 0, mae = 0, last: Candle | null = null;
  for (const c of candles) {
    if (c.t < from || c.t + barMs > end) continue;
    last = c;
    const fav = dir > 0 ? c.h - entry : entry - c.l;
    const adv = dir > 0 ? entry - c.l : c.h - entry;
    mfe = Math.max(mfe, toPips(pair, fav));
    mae = Math.max(mae, toPips(pair, adv));
    const stopHit = invalidation != null && (dir > 0 ? c.l <= invalidation : c.h >= invalidation);
    const targetHit = targetPips > 0 && (dir > 0 ? c.h >= target : c.l <= target);
    if (stopHit) return { status: "stop", resultPips: r1(toPips(pair, (invalidation! - entry) * dir)), mfePips: r1(mfe), maePips: r1(mae) };
    if (targetHit) return { status: "target", resultPips: targetPips, mfePips: r1(mfe), maePips: r1(mae) };
  }
  if (now >= end + barMs && last) return { status: "expired", resultPips: r1(toPips(pair, (last.c - entry) * dir)), mfePips: r1(mfe), maePips: r1(mae) };
  return { status: "open", resultPips: null, mfePips: r1(mfe), maePips: r1(mae) };
}

// Bir vaqtda chiqadigan yangiliklar (masalan NFP va ishsizlik darajasi) bitta tahlilga birlashtiriladi.
export function groupByTime<T extends { time: number }>(events: T[]): { time: number; events: T[] }[] {
  const out: { time: number; events: T[] }[] = [];
  for (const e of [...events].sort((a, b) => a.time - b.time)) {
    const g = out.find((x) => x.time === e.time);
    if (g) g.events.push(e);
    else out.push({ time: e.time, events: [e] });
  }
  return out;
}
