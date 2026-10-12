import "server-only";
import { ALL_INSTRUMENTS } from "../instruments.ts";
import { getContextCandles } from "../market.ts";
import { sql } from "./db.ts";
import { complete, provider } from "./llm.ts";
import { ohlc, round } from "./aiTrader.ts";
import type { Candle } from "../types.ts";

// Smart Trader AI: kuniga bir marta har juftlik uchun MN+W1+D1 shamlarni tahlil qilib
// katta darajalar, supply/demand zonalar va uzun muddatli trendni market_levels jadvaliga yozadi.
// aiTrader har savdo qarorida bu ma'lumotdan foydalanadi.

const PAIR = "XAU/USD";

export type MarketLevel = {
  id: number;
  pair: string;
  analyzed_at: Date;
  trend_long: string;
  trend_medium: string;
  levels: MarketLevels;
  summary: string;
  model: string;
};

export type MarketLevels = {
  // Uzun muddatli (oylik/yillik) darajalar
  yillik_high: number;
  yillik_low: number;
  uch_yillik_high: number;
  uch_yillik_low: number;
  // Haftalik darajalar
  haftalik_high: number;
  haftalik_low: number;
  oylik_high: number;
  oylik_low: number;
  // Kuchli qarshilik va tayanch darajalari (eng muhim 6 ta)
  kuchli_qarshilik: number[];
  kuchli_tayanch: number[];
  // Supply (taklif) zonalari — narx bu joydan pastga tushgan (SELL joylari)
  supply_zonalar: { pastki: number; yuqori: number; kuch: string; sabab: string }[];
  // Demand (talab) zonalari — narx bu joydan yuqoriga ko'tarilgan (BUY joylari)
  demand_zonalar: { pastki: number; yuqori: number; kuch: string; sabab: string }[];
  // Psixologik darajalar (round numbers)
  psixologik: number[];
};

const ANALYSIS_EVERY_H = 24;

// So'nggi tahlil vaqtini qaytaradi.
export async function lastAnalyzedAt(pair: string): Promise<Date | null> {
  const [r] = await sql<{ at: Date }>("SELECT analyzed_at AS at FROM market_levels WHERE pair = $1 ORDER BY analyzed_at DESC LIMIT 1", [pair]);
  return r ? new Date(r.at) : null;
}

// So'nggi market_levels yozuvini oladi.
export async function getMarketLevels(pair: string): Promise<MarketLevel | null> {
  const [r] = await sql<MarketLevel>("SELECT * FROM market_levels WHERE pair = $1 ORDER BY analyzed_at DESC LIMIT 1", [pair]);
  if (!r) return null;
  if (typeof r.levels === "string") r.levels = JSON.parse(r.levels);
  return r;
}

// Swing high/low ni M5/H1/H4 shamlardan topadi (lookback: har tomonda sham soni).
export function swingLevels(candles: Candle[], lookback = 5, d = 2): { highs: { t: string; p: number }[]; lows: { t: string; p: number }[] } {
  const highs: { t: string; p: number }[] = [];
  const lows: { t: string; p: number }[] = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    const isHigh = candles.slice(i - lookback, i).every((x) => x.h <= c.h) && candles.slice(i + 1, i + lookback + 1).every((x) => x.h <= c.h);
    const isLow = candles.slice(i - lookback, i).every((x) => x.l >= c.l) && candles.slice(i + 1, i + lookback + 1).every((x) => x.l >= c.l);
    if (isHigh) highs.push({ t: new Date(c.t).toISOString().slice(5, 13), p: round(c.h, d) });
    if (isLow) lows.push({ t: new Date(c.t).toISOString().slice(5, 13), p: round(c.l, d) });
  }
  return { highs: highs.slice(-10), lows: lows.slice(-10) };
}

// Sessiya high/low: Osiyo (00-09 UTC), London (07-16 UTC), NY (13-22 UTC)
export function sessionLevels(h1: Candle[], d = 2) {
  const now = Date.now();
  const dayAgo = now - 24 * 3600_000;
  const recent = h1.filter((c) => c.t > dayAgo);
  type Session = { high: number; low: number; bars: number };
  const asia: Session = { high: 0, low: Infinity, bars: 0 };
  const london: Session = { high: 0, low: Infinity, bars: 0 };
  const ny: Session = { high: 0, low: Infinity, bars: 0 };
  for (const c of recent) {
    const hour = new Date(c.t).getUTCHours();
    const sessions = [];
    if (hour >= 0 && hour < 9) sessions.push(asia);
    if (hour >= 7 && hour < 16) sessions.push(london);
    if (hour >= 13 && hour < 22) sessions.push(ny);
    for (const s of sessions) {
      s.high = Math.max(s.high, c.h);
      s.low = Math.min(s.low, c.l);
      s.bars++;
    }
  }
  return {
    osiyo: asia.bars > 0 ? { high: round(asia.high, d), low: round(asia.low, d) } : null,
    london: london.bars > 0 ? { high: round(london.high, d), low: round(london.low, d) } : null,
    ny: ny.bars > 0 ? { high: round(ny.high, d), low: round(ny.low, d) } : null,
  };
}

const LEVELS_SCHEMA = {
  type: "object",
  properties: {
    trend_long: { type: "string", enum: ["bull", "bear", "sideways"] },
    trend_medium: { type: "string", enum: ["bull", "bear", "sideways"] },
    yillik_high: { type: "number" }, yillik_low: { type: "number" },
    uch_yillik_high: { type: "number" }, uch_yillik_low: { type: "number" },
    haftalik_high: { type: "number" }, haftalik_low: { type: "number" },
    oylik_high: { type: "number" }, oylik_low: { type: "number" },
    kuchli_qarshilik: { type: "array", items: { type: "number" }, maxItems: 8 },
    kuchli_tayanch: { type: "array", items: { type: "number" }, maxItems: 8 },
    supply_zonalar: {
      type: "array", maxItems: 6,
      items: {
        type: "object",
        properties: { pastki: { type: "number" }, yuqori: { type: "number" }, kuch: { type: "string" }, sabab: { type: "string" } },
        required: ["pastki", "yuqori", "kuch", "sabab"],
      },
    },
    demand_zonalar: {
      type: "array", maxItems: 6,
      items: {
        type: "object",
        properties: { pastki: { type: "number" }, yuqori: { type: "number" }, kuch: { type: "string" }, sabab: { type: "string" } },
        required: ["pastki", "yuqori", "kuch", "sabab"],
      },
    },
    psixologik: { type: "array", items: { type: "number" }, maxItems: 10 },
    xulosa: { type: "string" },
  },
  required: ["trend_long", "trend_medium", "yillik_high", "yillik_low", "uch_yillik_high", "uch_yillik_low",
    "haftalik_high", "haftalik_low", "oylik_high", "oylik_low",
    "kuchli_qarshilik", "kuchli_tayanch", "supply_zonalar", "demand_zonalar", "psixologik", "xulosa"],
  additionalProperties: false,
};

const SYSTEM_HIST = (pair: string) => `Sen ${pair} bozorining tarixiy tahlilchisan. ${pair === PAIR ? "Oltin (XAU/USD) uzun muddatli bozor manzarasini" : "Bu juftlikning uzun muddatli manzarasini"} aniq va to'liq tahlil qil.

Berilgan ma'lumot: oylik (MN) — 8+ yil tarix, haftalik (W1) — 4-5 yil, kunlik (D1) — 1 yil.

Topish kerak:
1. **Uzun muddatli trend** (oylik shamlar bo'yicha): bull (yuqoriga), bear (pastga), sideways (yon).
2. **O'rta muddatli trend** (haftalik shamlar bo'yicha).
3. **Yillik high/low** — oxirgi 12 oylik eng baland va eng past narx.
4. **3 yillik high/low** — oxirgi 3 yillik eng baland va eng past.
5. **Haftalik va oylik high/low** — joriy hafta va oy.
6. **Kuchli qarshilik darajalari** (6-8 ta, pastdan yuqoriga): narx bir necha marta tekkan va qaytgan yuqori darajalar.
7. **Kuchli tayanch darajalari** (6-8 ta, yuqoridan pastga): narx bir necha marta tekkan va qaytgan past darajalar.
8. **Supply zonalar** (taklif, narx pastga qaytgan): har zona uchun pastki, yuqori, kuch (kuchli/o'rtacha/zaif), sabab.
9. **Demand zonalar** (talab, narx yuqoriga qaytgan): har zona uchun pastki, yuqori, kuch, sabab.
10. **Psixologik darajalar** — yirik round sonlar (masalan oltin uchun 4000, 4100, 4200, 4500...).
11. **Xulosa** (o'zbek tilida lotin): 3-5 jumla — bozor qaysi bosqichda, eng muhim darajalar, savdochi ehtibor berishi kerak narsalar.

Qoidalar:
- Faqat berilgan shamlar va narxlarga asoslan. Daraja o'ylab topma.
- Har bir zona kamida 2 ta tasdiqlangan reaktsiya asosida bo'lsin.
- Javob faqat JSON format.`;

// Tarixiy bozor tahlilini yangilaydi: kuniga bir marta, kerak bo'lsa force=true.
export async function analyzeMarketHistory(pair: string, force = false): Promise<{ updated: boolean; reason?: string }> {
  if (!provider()) return { updated: false, reason: "AI ulanmagan" };
  if (!force) {
    const last = await lastAnalyzedAt(pair);
    if (last && Date.now() - last.getTime() < ANALYSIS_EVERY_H * 3600_000) {
      return { updated: false, reason: "Hali vaqti emas" };
    }
  }
  const inst = ALL_INSTRUMENTS.find((i) => i.pair === pair);
  if (!inst) return { updated: false, reason: "Juftlik topilmadi" };

  const [mn, w1, d1] = await Promise.all([
    getContextCandles(inst, "MN"),
    getContextCandles(inst, "W1"),
    getContextCandles(inst, "D1"),
  ]);
  if (!mn.length || !w1.length) return { updated: false, reason: "Ma'lumot yo'q" };

  const d = pair === PAIR ? 2 : 5;
  const data = {
    juftlik: pair,
    tahlil_vaqti: new Date().toISOString(),
    shamlar_ustunlari: "vaqt_utc, open, high, low, close",
    MN_shamlar_8yil: ohlc(mn, d),
    W1_shamlar_5yil: ohlc(w1, d),
    D1_shamlar_1yil: ohlc(d1.slice(-365), d),
  };

  const model = provider() === "anthropic" ? "claude-opus-5-5" : undefined;
  const text = await complete(SYSTEM_HIST(pair), [{ role: "user", content: JSON.stringify(data) }], {
    json: LEVELS_SCHEMA, model, maxTokens: provider() === "anthropic" ? 8000 : 3000,
    thinking: provider() === "anthropic",
  });

  let parsed: (MarketLevels & { trend_long: string; trend_medium: string; xulosa: string }) | null = null;
  try {
    parsed = JSON.parse(text.match(/\{[\s\S]*\}/)![0]);
  } catch {
    return { updated: false, reason: "Javob o'qilmadi" };
  }
  if (!parsed) return { updated: false, reason: "Bo'sh javob" };

  const { trend_long, trend_medium, xulosa, ...levelsRest } = parsed;
  await sql(
    `INSERT INTO market_levels (pair, trend_long, trend_medium, levels, summary, model)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [pair, trend_long, trend_medium, JSON.stringify(levelsRest), xulosa ?? "", model ?? ""],
  );
  return { updated: true };
}

// Barcha treyder juftliklari uchun tarixiy tahlilni yangilaydi (kunlik cron yoki admin so'rovi).
export async function refreshAllMarketLevels(force = false) {
  const { traderPairs } = await import("./aiTrader.ts");
  const pairs = traderPairs().map((i) => i.pair);
  const results: Record<string, string> = {};
  for (const pair of pairs) {
    const r = await analyzeMarketHistory(pair, force).catch((e) => ({ updated: false, reason: (e as Error).message }));
    results[pair] = r.updated ? "yangilandi" : (r.reason ?? "o'tkazib yuborildi");
  }
  return results;
}
