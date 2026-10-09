import type { Category, Instrument } from "./types.ts";

// Oltin va valyutalar uchun TWELVEDATA_API_KEY berilsa Twelve Data ishlatiladi,
// aks holda kalitsiz Yahoo Finance. Yahoo'da oltin uchun GC=F (oltin fyuchersi)
// olinadi, u spot XAU/USD dan bir necha dollar farq qilishi mumkin.
const useTwelve = !!process.env.TWELVEDATA_API_KEY;

function fx(pair: string, category: "gold" | "forex", yahoo: string): Instrument {
  return useTwelve
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

// Robot qaysi bozorlarni kuzatadi. Hozircha faqat oltin; kripto va valyuta keyin bosqichma-bosqich qo'shiladi:
//   ACTIVE_CATEGORIES=gold            (standart)
//   ACTIVE_CATEGORIES=gold,forex      (oltin va valyuta)
//   ACTIVE_CATEGORIES=gold,forex,crypto
const ALL_CATEGORIES: Category[] = ["gold", "forex", "crypto"];

export function activeCategories(env: Record<string, string | undefined> = process.env): Category[] {
  const want = (env.ACTIVE_CATEGORIES ?? "gold").split(",").map((s) => s.trim().toLowerCase());
  const cats = ALL_CATEGORIES.filter((c) => want.includes(c));
  return cats.length ? cats : ["gold"];
}

export function activeInstruments(env: Record<string, string | undefined> = process.env): Instrument[] {
  const cats = activeCategories(env);
  return ALL_INSTRUMENTS.filter((i) => cats.includes(i.category));
}
