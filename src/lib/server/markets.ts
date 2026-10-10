import "server-only";
import { ALL_MARKETS, setMarketOverride } from "../instruments.ts";
import type { Category } from "../types.ts";
import { db } from "./db.ts";

// Bozor tugmalari (egasining talabi, 2026-10-10): admin paneldan oltin, valyuta va kriptoni yoqish/o'chirish.
// O'chirilgan bozorda Zeus tahlil qilmaydi va Claude chaqirilmaydi (pul ketmaydi). Tanlov app_settings.markets da,
// har serverda 20 soniyada bir yangilanadi (sql() dan oldin). Yozuv bo'lmasa ROBOT_MARKETS (Vercel) ishlaydi.

const TTL = 20_000;
const g = globalThis as unknown as { __sdMarketsAt?: number; __sdMarketsLoading?: Promise<void> };

export const parseMarkets = (v: string): Category[] => ALL_MARKETS.filter((c) => v.split(",").map((s) => s.trim()).includes(c));

export async function refreshMarkets(force = false) {
  if (!force && g.__sdMarketsAt && Date.now() - g.__sdMarketsAt < TTL) return;
  g.__sdMarketsLoading ??= (async () => {
    try {
      const { rows } = await (await db()).query<{ value: string }>("SELECT value FROM app_settings WHERE key = 'markets'");
      setMarketOverride(rows[0] ? parseMarkets(rows[0].value) : null);
      g.__sdMarketsAt = Date.now();
    } catch { /* jadval hali yo'q bo'lsa ROBOT_MARKETS ishlaydi */ } finally { g.__sdMarketsLoading = undefined; }
  })();
  await g.__sdMarketsLoading;
}

export async function saveMarkets(cats: Category[]) {
  const value = ALL_MARKETS.filter((c) => cats.includes(c)).join(",");
  await (await db()).query(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ('markets', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = now()`, [value],
  );
  await refreshMarkets(true);
}
