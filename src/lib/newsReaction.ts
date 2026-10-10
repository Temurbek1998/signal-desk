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

// Yangilik efiri paytidagi impuls (egasining talabi): ketma-ket 2-3 ta M1 sham bir tomonga, katta shamlar bilan
// (forex/oltinda haqiqiy hajm yo'q, shuning uchun "katta hajm" o'rniga sham diapazoni chiqishdan oldingi o'rtachadan katta bo'lishi
// olinadi; manba hajm bersa u ham tekshiriladi). Topilsa yo'nalish, harakat pipsi va shamlar soni qaytadi.
export type Impulse = { side: "BUY" | "SELL"; bars: number; movePips: number; from: number; to: number; price: number; rangeX: number; t: number };
export type ImpulseRules = { minPips: number; rangeX: number; moveX: number };
export const IMPULSE_RULES: ImpulseRules = { minPips: 60, rangeX: 1.5, moveX: 4 };

export function detectImpulse(pair: string, m1: (Candle & { v?: number })[], releaseAt: number, rules: ImpulseRules = IMPULSE_RULES): Impulse | null {
  const pre = m1.filter((c) => c.t < releaseAt).slice(-30);
  if (pre.length < 5) return null;
  const avgRange = pre.reduce((a, c) => a + (c.h - c.l), 0) / pre.length || pipSize(pair);
  const avgVol = pre.every((c) => c.v != null && c.v > 0) ? pre.reduce((a, c) => a + c.v!, 0) / pre.length : 0;
  const after = m1.filter((c) => c.t >= releaseAt - 60_000);
  // Eng uzun mos keladigan zanjir (3 sham, bo'lmasa 2) oxirgi yopilgan shamda tugashi kerak: eski impuls qayta xabar qilinmaydi.
  for (const n of [3, 2]) {
    const g = after.slice(-n);
    if (g.length < n) continue;
    const dir = Math.sign(g.at(-1)!.c - g[0].o);
    if (!dir || g.some((c) => Math.sign(c.c - c.o) !== dir)) continue;
    const move = Math.abs(g.at(-1)!.c - g[0].o);
    const big = g.every((c) => c.h - c.l >= rules.rangeX * avgRange);
    const vol = !avgVol || g.reduce((a, c) => a + (c.v ?? 0), 0) / n >= rules.rangeX * avgVol;
    const pips = toPips(pair, move);
    if (big && vol && pips >= rules.minPips && move >= rules.moveX * avgRange) {
      return { side: dir > 0 ? "BUY" : "SELL", bars: n, movePips: r1(pips), from: g[0].o, to: g.at(-1)!.c, price: g.at(-1)!.c, rangeX: r1(g.reduce((a, c) => a + (c.h - c.l), 0) / n / avgRange), t: g.at(-1)!.t };
    }
  }
  return null;
}
