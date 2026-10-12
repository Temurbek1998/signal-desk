import { CLOSED_STATUS, PAIR } from "../clientSignal.ts";
import type { AiTrade } from "./aiTrader.ts";
import { sql } from "./db.ts";
import type { LoggedSignal, Stats } from "./track.ts";

// Mijoz oltin signallari manbai (egasining qarori, 2026-10-10): Claude treyderning o'z kun ichidagi qarorlari
// (kirish, SL, TP Claude'dan). Saytda nomi "Zeus" bo'lib qoladi. GOLD_SIGNAL_SOURCE=zeus eski yo'lga qaytaradi.
export const claudeSource = () => (process.env.GOLD_SIGNAL_SOURCE ?? "claude") !== "zeus";
// Demo hisob bilan bir xil chegara: ishonchi past qarorlar mijozga bormaydi.
export const clientMinConf = () => Math.max(0, Number(process.env.AI_DEMO_MIN_CONF ?? 80));

const BASE = `pair = $1 AND mode = 'intraday' AND action IN ('BUY', 'SELL') AND status NOT IN ('wait', 'rejected') AND confidence >= $2`;
// Ekran uchun: ochiq savdolar, bo'lmasa so'nggi 8 soatda yopilgani, bo'lmasa hech narsa.
export async function clientCards(): Promise<AiTrade[]> {
  const open = await sql<AiTrade>(`SELECT * FROM ai_trades WHERE ${BASE} AND status IN ('open', 'tp1') ORDER BY at DESC`, [PAIR, clientMinConf()]);
  if (open.length) return open;
  return sql<AiTrade>(
    `SELECT * FROM ai_trades WHERE ${BASE} AND closed_at > now() - interval '8 hours' ORDER BY at DESC LIMIT 1`, [PAIR, clientMinConf()],
  );
}

// Kunlik limit uchun: Toshkent kuni bo'yicha bugungi mijoz signallari, vaqt tartibida.
export async function todayIds(): Promise<number[]> {
  const rows = await sql<{ id: string }>(
    `SELECT id FROM ai_trades WHERE ${BASE} AND (at + interval '5 hours')::date = (now() + interval '5 hours')::date ORDER BY at`,
    [PAIR, clientMinConf()],
  );
  return rows.map((r) => Number(r.id));
}

// Ochiq natijalar: mijozga berilgan Claude oltin signallari.
export async function clientRecord(days = 90): Promise<Stats[]> {
  const [r] = await sql<{ closed: string; wins: string; gain: number | null; loss: number | null; total: number | null }>(
    `SELECT count(*) AS closed, count(*) FILTER (WHERE result_r > 0) AS wins, sum(result_r) FILTER (WHERE result_r > 0) AS gain,
            -sum(result_r) FILTER (WHERE result_r < 0) AS loss, sum(result_r) AS total
     FROM ai_trades WHERE ${BASE} AND result_r IS NOT NULL AND at > now() - make_interval(days => $3)`,
    [PAIR, clientMinConf(), days],
  );
  const closed = Number(r?.closed ?? 0);
  if (!closed) return [];
  const wins = Number(r.wins);
  return [{ timeframe: "ALL", closed, wins, winRate: wins / closed, profitFactor: r.loss ? Number(r.gain ?? 0) / Number(r.loss) : null, totalR: Number(r.total ?? 0) }];
}

export async function clientClosed(limit = 40): Promise<LoggedSignal[]> {
  const rows = await sql<AiTrade>(
    `SELECT * FROM ai_trades WHERE ${BASE} AND result_r IS NOT NULL ORDER BY at DESC LIMIT $3`, [PAIR, clientMinConf(), limit],
  );
  return rows.map((t) => ({
    id: Number(t.id), pair: t.pair, timeframe: "M5–H4", strategy: "trend", side: t.action, entry: Number(t.entry), tp1: Number(t.tp1),
    tp2: Number(t.tp2), sl: Number(t.sl), signal_time: t.at, status: CLOSED_STATUS[t.status] ?? "close", result_r: Number(t.result_r),
  }));
}

export { PAIR, toSignal } from "../clientSignal.ts";
