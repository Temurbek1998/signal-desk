import "server-only";
import { analyze } from "../engine.ts";
import { ema } from "../indicators.ts";
import { activeInstruments, ALL_INSTRUMENTS } from "../instruments.ts";
import { getCandles, minutesOf } from "../market.ts";
import { signalLabel, TIMEFRAMES, type Timeframe } from "../types.ts";
import { sql } from "./db.ts";
import type { ChartSignal } from "@/app/components/RobotChart.tsx";

// Admin "Robot tahlili" sahifasi uchun ma'lumot: grafik shamlari, EMA, robot signallari, holat va katta trend.

export type StateRow = { timeframe: string; updated_at: Date; side: string | null; quality: string | null; status: string | null; confidence: number; price: number | null; reason: string };

export function digitsOf(pair: string, price: number) {
  if (pair === "XAU/USD") return 2;
  if (pair.includes("JPY")) return 3;
  if (pair.includes("/USDT")) return price >= 1000 ? 2 : price >= 1 ? 3 : 5;
  return 5;
}

export function pickInstrument(pair?: string) {
  const list = activeInstruments();
  return list.find((i) => i.pair === pair) ?? ALL_INSTRUMENTS.find((i) => i.pair === pair) ?? list[0];
}

export async function chartData(pair: string | undefined, tf: Timeframe, bars = 140) {
  const inst = pickInstrument(pair);
  const minutes = minutesOf(tf);
  const all = await getCandles(inst, minutes, 260);
  const closes = all.map((c) => c.c);
  const e20 = ema(closes, 20), e50 = ema(closes, 50);
  const from = Math.max(0, all.length - bars);
  const candles = all.slice(from);
  const since = candles.length ? new Date(candles[0].t) : new Date();
  const [sigs, states, ctx] = await Promise.all([
    sql<{ signal_time: Date; side: "BUY" | "SELL"; entry: number; tp1: number; tp2: number; sl: number; status: string; strategy: string }>(
      `SELECT signal_time, side, entry, tp1, tp2, sl, status, strategy FROM signal_log
       WHERE pair = $1 AND timeframe = $2 AND (signal_time >= $3 OR status = 'active') ORDER BY signal_time`,
      [inst.pair, tf, since],
    ),
    sql<StateRow>("SELECT timeframe, updated_at, side, quality, status, confidence, price, reason FROM robot_state WHERE pair = $1", [inst.pair]),
    sql<{ timeframe: string; trend: string }>("SELECT timeframe, trend FROM market_context WHERE pair = $1", [inst.pair]),
  ]);
  const signals: ChartSignal[] = sigs.map((s) => ({
    t: new Date(s.signal_time).getTime(), side: s.side, entry: +s.entry, tp1: +s.tp1, tp2: +s.tp2, sl: +s.sl, status: s.status,
    label: s.strategy === "trend" ? s.side : `${s.side} (${signalLabel(s.strategy).split(" · ")[1] ?? ""})`,
  }));
  const last = candles[candles.length - 1]?.c ?? 0;
  return {
    inst, tf, minutes, digits: digitsOf(inst.pair, last), candles,
    ema20: e20.slice(from), ema50: e50.slice(from), signals,
    analysis: analyze(all.slice(-200)),
    states: TIMEFRAMES.map((t) => states.find((s) => s.timeframe === t)).filter(Boolean) as StateRow[],
    context: ctx,
  };
}

// Berilgan vaqt atrofidagi grafik (admin tahlil sahifasi): oldidan `before`, keyin ko'pi bilan `after` sham.
// Ma'lumot oxirgi 260 sham bilan cheklangan: juda eski signal uchun grafik mavjud qismini ko'rsatadi.
export async function windowChart(pair: string, minutes: number, at: number, before = 90, after = 60) {
  const inst = pickInstrument(pair);
  const all = await getCandles(inst, minutes, 260);
  const closes = all.map((c) => c.c);
  const e20 = ema(closes, 20), e50 = ema(closes, 50);
  let i = all.findIndex((c) => c.t >= at);
  if (i < 0) i = all.length - 1;
  const from = Math.max(0, i - before), to = Math.min(all.length, i + after + 1);
  const candles = all.slice(from, to);
  return { candles, ema20: e20.slice(from, to), ema50: e50.slice(from, to), digits: digitsOf(inst.pair, all.at(-1)?.c ?? 0), covered: all.length > 0 && all[0].t <= at };
}
