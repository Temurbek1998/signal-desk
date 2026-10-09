import "server-only";
import { rate, ratePips, type Memory } from "../memory.ts";
import { sql } from "./db.ts";

const WINDOW_DAYS = 60;

async function mem(where: string, params: unknown[]): Promise<Memory> {
  const [r] = await sql<{ n: string; wins: string }>(
    `SELECT count(*) AS n, count(*) FILTER (WHERE result_r > 0) AS wins FROM signal_log
     WHERE status <> 'active' AND signal_time > now() - make_interval(days => ${WINDOW_DAYS}) AND ${where}`,
    params,
  );
  return { n: Number(r.n), wins: Number(r.wins) };
}

// Yangi signal uchun xotiradan reyting: shu juftlik+taymfreym va shu taymfreym+yo'nalish natijalari.
export async function rateFromMemory(pair: string, timeframe: string, side: string, confidence: number) {
  const [pairMem, sideMem] = await Promise.all([
    mem("strategy = 'trend' AND pair = $1 AND timeframe = $2", [pair, timeframe]),
    mem("strategy = 'trend' AND timeframe = $1 AND side = $2", [timeframe, side]),
  ]);
  return { ...rate(confidence, pairMem, sideMem), n: pairMem.n };
}

// Pips rejimi uchun alohida xotira: shu juftlik va strategiyaning yopilgan savdolari.
export async function ratePipsFromMemory(pair: string, strategy: string) {
  const m = await mem("pair = $1 AND strategy = $2", [pair, strategy]);
  return { ...ratePips(m), n: m.n };
}

export type MemoryRow = { pair: string; timeframe: string; n: number; wins: number };

export async function memoryTable(): Promise<MemoryRow[]> {
  const rows = await sql<{ pair: string; timeframe: string; n: string; wins: string }>(
    `SELECT pair, CASE strategy WHEN 'trend' THEN timeframe ELSE timeframe || ' ' || strategy END AS timeframe,
            count(*) AS n, count(*) FILTER (WHERE result_r > 0) AS wins FROM signal_log
     WHERE status <> 'active' AND signal_time > now() - make_interval(days => ${WINDOW_DAYS})
     GROUP BY 1, 2 ORDER BY 1, 2`,
  );
  return rows.map((r) => ({ pair: r.pair, timeframe: r.timeframe, n: Number(r.n), wins: Number(r.wins) }));
}
