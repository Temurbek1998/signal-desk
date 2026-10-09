export type Candle = { t: number; o: number; h: number; l: number; c: number };

export type Category = "crypto" | "gold" | "forex";
export type Timeframe = "M5" | "M15" | "M30" | "H1";
export const TIMEFRAMES: Timeframe[] = ["M5", "M15", "M30", "H1"];

export type Instrument = {
  pair: string; // ko'rsatiladigan nom, masalan "EUR/USD"
  category: Category;
  source: "binance" | "yahoo" | "twelvedata";
  symbol: string; // manbadagi belgi
};

export type Side = "BUY" | "SELL";

// Katta taymfreymlar: signal uchun emas, bozorning umumiy manzarasi uchun (H4, kunlik, haftalik, oylik).
export type ContextTf = "H4" | "D1" | "W1" | "MN";
export const CONTEXT_TFS: ContextTf[] = ["H4", "D1", "W1", "MN"];
export type Trend = "up" | "down" | "flat";
export type MarketContext = Partial<Record<ContextTf, Trend>>;

// trend: asosiy strategiya (yuqori aniqlik, TP1/TP2). pips-*: oltin uchun fiks pips maqsadli rejim (GOLD_BACKTEST.md).
export type Strategy = "trend" | "pips-pullback" | "pips-london" | "scalp-razgon";
export const STRATEGY_NAME: Record<Strategy, string> = { trend: "Trend", "pips-pullback": "Pips: pullback", "pips-london": "Pips: London", "scalp-razgon": "Razgon" };

// Ikki robot: Zeus (trend va 300–400 pips rejimlari) va Gerakl (skalping va razgon, M5).
export type Robot = "zeus" | "gerakl";
export const ROBOT_NAME: Record<Robot, string> = { zeus: "Zeus", gerakl: "Gerakl" };
export const robotOf = (strategy?: Strategy | string | null): Robot => (strategy?.startsWith("scalp") ? "gerakl" : "zeus");
// Ko'rsatish uchun: "Zeus", "Zeus · Pips: London", "Gerakl · Razgon".
export const signalLabel = (strategy?: Strategy | string | null) => {
  const r = ROBOT_NAME[robotOf(strategy)];
  return !strategy || strategy === "trend" ? r : `${r} · ${STRATEGY_NAME[strategy as Strategy] ?? strategy}`;
};

export type Signal = {
  pair: string;
  category: Category;
  timeframe: Timeframe;
  side: Side | null; // null = hozircha signal yo'q
  entry: number;
  tp1: number | null;
  tp2: number | null;
  sl: number | null;
  confidence: number; // 0-100
  reasons: string[];
  rsi: number;
  trend: "up" | "down" | "flat";
  candleTime: number; // signal hisoblangan yopilgan sham vaqti (ms)
  price: number; // oxirgi narx
  status: "active" | "tp1" | "tp2" | "sl" | "close" | null; // signal berilgandan keyingi natija ("close": kun oxirida yopildi)
  barsAgo: number; // signal necha sham oldin berilgan
  rejected?: string | null; // signal berilmagan sabab (faqat signal yo'q bo'lsa)
  quality?: "strong" | "weak";
  rating?: "A" | "B" | "C" | null; // xotira asosidagi reyting (faqat jurnalga yozilgan kuchli signallar)
  memoryN?: number | null; // shu juftlik/taymfreymda xotiradagi yopilgan signallar soni
  memoryWinrate?: number | null; // xotira bo'yicha kutilgan win rate
  locked?: boolean; // tarif limiti tufayli yashirilgan // strong: tarixiy sinovda barqaror ijobiy natija bergan sharoit
  newsRisk?: { title: string; currency: string; time: number } | null; // yaqin orada muhim yangilik
  context?: MarketContext; // H4, D1, W1, MN trendi (faqat ma'lumot, reytingga ta'sir qilmaydi)
  strategy?: Strategy; // berilmasa "trend"
  ai?: { verdict: "tasdiq" | "ehtiyot"; confidence: number; note: string } | null; // AI hamkorning ikkinchi fikri
  resultR?: number | null; // pips rejimida natija R da (TP = 1.5R yoki 2R, kun oxirida yopilsa haqiqiy natija)
};
