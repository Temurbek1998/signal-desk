import "server-only";
import { bucket, simulate, summarize, type Trade } from "../../../scripts/backtest.ts";
import { SL_ATR, TP1_R, TP2_R } from "../engine.ts";
import { activeInstruments } from "../instruments.ts";
import type { Candle, Category, Instrument } from "../types.ts";

// Bozorlar sinovi: robotning joriy qoidalarini (trend, M15 va M30) har bir valyuta va kripto juftligining
// so'nggi ~60 kunlik tarixida sinaydi. Oltin alohida, kattaroq tarixda sinalgan (GOLD_BACKTEST.md).
// Natija komissiyadan keyin, risk birligida (R). Natija barqarorligi uchun ma'lumot ikki yarmga bo'lib ham hisoblanadi.

const FEE_PCT: Record<Category, number> = { crypto: 0.04, forex: 0.005, gold: 0.01 }; // bir tomonga, foizda
const TFS = [{ tf: "M15", m: 15 }, { tf: "M30", m: 30 }] as const;

async function json(url: string, init?: RequestInit) {
  const r = await fetch(url, { ...init, cache: "no-store" });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}

// Binance: 15 daqiqalik shamlar, 1000 tadan sahifalab ~62 kun.
async function binance15(symbol: string): Promise<Candle[]> {
  let end = Date.now();
  const out: Candle[] = [];
  for (let i = 0; i < 6; i++) {
    const rows: unknown[][] = await json(`https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=15m&limit=1000&endTime=${end}`);
    if (!rows.length) break;
    out.unshift(...rows.map((r) => ({ t: Number(r[0]), o: +String(r[1]), h: +String(r[2]), l: +String(r[3]), c: +String(r[4]) })));
    end = Number(rows[0][0]) - 1;
  }
  return out;
}

// Yahoo: 15 daqiqalik shamlar uchun eng ko'pi 60 kun beradi.
async function yahoo15(symbol: string): Promise<Candle[]> {
  const d = await json(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=15m&range=60d`,
    { headers: { "User-Agent": "Mozilla/5.0 (signal-desk)" } });
  const r = d?.chart?.result?.[0];
  if (!r) throw new Error("Yahoo: ma'lumot yo'q");
  const q = r.indicators.quote[0];
  const out: Candle[] = [];
  r.timestamp.forEach((ts: number, i: number) => {
    if ([q.open[i], q.high[i], q.low[i], q.close[i]].some((v) => v == null)) return;
    out.push({ t: ts * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] });
  });
  return out;
}

export type TestRow = {
  pair: string; category: Category; tf: string; days: number;
  trades: number; winRate: number; avgR: number; pf: number; half1: number; half2: number;
  verdict: "foydali" | "zararli" | "kam ma'lumot";
};

function run(c: Candle[], m: number, category: Category): Trade[] {
  return simulate(bucket(c, m), bucket(c, 60), m, 60, { name: "joriy", slMult: SL_ATR, tp1R: TP1_R, tp2R: TP2_R, minConf: 0, category });
}

async function testInstrument(inst: Instrument): Promise<TestRow[]> {
  const c = inst.source === "binance" ? await binance15(inst.symbol) : await yahoo15(inst.symbol);
  const days = c.length ? Math.round((c[c.length - 1].t - c[0].t) / 86_400_000) : 0;
  const half = c.length >> 1;
  return TFS.map(({ tf, m }) => {
    const fee = FEE_PCT[inst.category];
    const s = summarize(run(c, m, inst.category), fee);
    const h1 = summarize(run(c.slice(0, half), m, inst.category), fee);
    const h2 = summarize(run(c.slice(half), m, inst.category), fee);
    // Foydali: o'rtacha natija musbat va ikkala yarmida ham musbat. 15 tadan kam savdo bo'lsa xulosa chiqarilmaydi.
    const verdict = s.trades < 15 ? "kam ma'lumot" : s.avgR > 0 && h1.avgR > 0 && h2.avgR > 0 ? "foydali" : "zararli";
    return { pair: inst.pair, category: inst.category, tf, days, trades: s.trades, winRate: s.winRate, avgR: s.avgR,
      pf: s.profitFactor, half1: h1.avgR, half2: h2.avgR, verdict };
  });
}

export async function testMarkets(): Promise<{ rows: TestRow[]; errors: string[] }> {
  const insts = activeInstruments().filter((i) => i.category !== "gold");
  const res = await Promise.allSettled(insts.map(testInstrument));
  const rows: TestRow[] = [];
  const errors: string[] = [];
  res.forEach((r, i) => (r.status === "fulfilled" ? rows.push(...r.value) : errors.push(`${insts[i].pair}: ${String(r.reason?.message ?? r.reason)}`)));
  return { rows, errors };
}

// Sinovni o'tkazib, natijani bazaga yozadi (eski natijalar tarix sifatida qoladi, oxirgi 20 tasi).
export async function saveMarketTest() {
  const { sql } = await import("./db.ts");
  const r = await testMarkets();
  await sql("INSERT INTO market_test (rows, errors) VALUES ($1, $2)", [JSON.stringify(r.rows), r.errors.join("\n")]);
  await sql("DELETE FROM market_test WHERE id NOT IN (SELECT id FROM market_test ORDER BY at DESC LIMIT 20)");
  return r;
}

export async function lastMarketTest(): Promise<{ at: Date; rows: TestRow[]; errors: string } | null> {
  const { sql } = await import("./db.ts");
  const [r] = await sql<{ at: Date; rows: TestRow[]; errors: string }>("SELECT at, rows, errors FROM market_test ORDER BY at DESC LIMIT 1");
  return r ?? null;
}
