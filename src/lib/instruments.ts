import type { Category, Instrument } from "./types.ts";

// Oltin va valyutalar uchun TWELVEDATA_API_KEY berilsa Twelve Data ishlatiladi,
// aks holda kalitsiz Yahoo Finance. Yahoo'da oltin uchun GC=F (oltin fyuchersi)
// olinadi, u spot XAU/USD dan bir necha dollar farq qilishi mumkin.
const useTwelve = !!process.env.TWELVEDATA_API_KEY;

// Twelve Data bepul tarifi kuniga 800 so'rov: u faqat oltinga ishlatiladi, valyutalar doim Yahoo'dan olinadi.
function fx(pair: string, category: "gold" | "forex", yahoo: string): Instrument {
  return useTwelve && category === "gold"
    ? { pair, category, source: "twelvedata", symbol: pair }
    : { pair, category, source: "yahoo", symbol: yahoo };
}

export const ALL_INSTRUMENTS: Instrument[] = [
  { pair: "BTC/USDT", category: "crypto", source: "binance", symbol: "BTCUSDT" },
  { pair: "ETH/USDT", category: "crypto", source: "binance", symbol: "ETHUSDT" },
  { pair: "SOL/USDT", category: "crypto", source: "binance", symbol: "SOLUSDT" },
  { pair: "BNB/USDT", category: "crypto", source: "binance", symbol: "BNBUSDT" },
  { pair: "XRP/USDT", category: "crypto", source: "binance", symbol: "XRPUSDT" },
  fx("XAU/USD", "gold", "GC=F"),
  fx("EUR/USD", "forex", "EURUSD=X"),
  fx("GBP/USD", "forex", "GBPUSD=X"),
  fx("USD/JPY", "forex", "JPY=X"),
  fx("AUD/USD", "forex", "AUDUSD=X"),
  fx("USD/CHF", "forex", "CHF=X"),
  fx("USD/CAD", "forex", "CAD=X"),
];

// Robot qaysi bozorlarda ishlaydi (standart: hammasi). Mijozlarga qaysilari ko'rinishini PUBLIC_CATEGORIES belgilaydi.
//   ROBOT_MARKETS=gold,forex,crypto   (standart)
//   ROBOT_MARKETS=gold                (faqat oltin)
const ALL_CATEGORIES: Category[] = ["gold", "forex", "crypto"];

export function activeCategories(env: Record<string, string | undefined> = process.env): Category[] {
  const want = (env.ROBOT_MARKETS ?? "gold,forex,crypto").split(",").map((s) => s.trim().toLowerCase());
  const cats = ALL_CATEGORIES.filter((c) => want.includes(c));
  return cats.length ? cats : ["gold"];
}

// Mijozlarga ochiq bozorlar. Qolgan faol bozorlar (masalan valyuta, kripto) faqat admin, Telegram va demo hisobda
// ishlaydi (reyting C), toki natijasi yetarli bo'lmaguncha:  PUBLIC_CATEGORIES=gold  (standart)
export function publicCategories(env: Record<string, string | undefined> = process.env): Category[] {
  const want = (env.PUBLIC_CATEGORIES ?? "gold").split(",").map((s) => s.trim().toLowerCase());
  return ALL_CATEGORIES.filter((c) => want.includes(c));
}

export function activeInstruments(env: Record<string, string | undefined> = process.env): Instrument[] {
  const cats = activeCategories(env);
  return ALL_INSTRUMENTS.filter((i) => cats.includes(i.category));
}
