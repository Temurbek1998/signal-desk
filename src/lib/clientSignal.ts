import { activeStop } from "./aiTrade.ts";
import type { AiTrade } from "./server/aiTrader.ts";
import type { Signal, Timeframe } from "./types.ts";

// Claude treyder savdosini mijoz signal kartasiga aylantirish (server/clientSignals.ts uchun, sof funksiyalar).
export const PAIR = "XAU/USD";
const TF_MIN: Record<string, number> = { M5: 5, M15: 15, M30: 30, H1: 60 };
export const CLOSED_STATUS: Record<string, NonNullable<Signal["status"]>> = { sl: "sl", be: "tp1", tp2: "tp2", trail: "close", expired: "close", closed: "close" };

// Mijozga ichki nom ko'rinmasin (qat'iy qoida: saytda "Claude"/"Anthropic" yo'q).
export const scrub = (s: string) => s.replace(/claude|anthropic|opus|sonnet/gi, "Zeus");

export function toSignal(t: AiTrade, tf: Timeframe, price: number, base?: Signal): Signal {
  const dir = t.action === "BUY" ? 1 : -1;
  const entry = Number(t.entry);
  const open = t.status === "open" || t.status === "tp1";
  const stop = activeStop(t.tp1_hit ? entry : Number(t.sl), dir, t.stops ?? []);
  const at = new Date(t.at).getTime();
  const reasons = scrub(t.reason).split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean).slice(0, 4);
  return {
    pair: PAIR, category: "gold", timeframe: tf, side: t.action as "BUY" | "SELL", entry,
    tp1: Number(t.tp1), tp2: Number(t.tp2), sl: Number(t.sl), confidence: t.confidence, reasons,
    rsi: base?.rsi ?? 50, trend: base?.trend ?? (dir > 0 ? "up" : "down"), candleTime: at, price,
    status: open ? "active" : CLOSED_STATUS[t.status] ?? "close",
    barsAgo: Math.max(0, Math.floor((Date.now() - at) / ((TF_MIN[tf] ?? 15) * 60_000))),
    quality: "strong", rating: null, newsRisk: base?.newsRisk ?? null, context: base?.context, strategy: "trend",
    tp1Hit: t.tp1_hit, trailStop: open && stop !== Number(t.sl) ? stop : null, ai: null,
    resultR: t.result_r == null ? null : Number(t.result_r),
  };
}

