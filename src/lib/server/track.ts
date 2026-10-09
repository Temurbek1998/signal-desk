import "server-only";
import { geraklEnabled } from "../scalp.ts";
import { TP1_R, TP2_R } from "../engine.ts";
import type { Signal, Timeframe } from "../types.ts";
import { activeCategories, publicCategories } from "../instruments.ts";
import { sql } from "./db.ts";
import { rateFromMemory, ratePipsFromMemory } from "./memory.ts";
import { closedMessage, signalMessage } from "../telegram.ts";
import { notifyAdmin } from "./telegram.ts";

// Natija risk birligida (R): SL = -1; TP1 da yarmi yopiladi, qolgani kirishda yoki TP2 da.
export function resultR(status: Signal["status"]): number | null {
  if (status === "sl") return -1;
  if (status === "tp1") return 0.5 * TP1_R;
  if (status === "tp2") return 0.5 * TP1_R + 0.5 * TP2_R;
  return null;
}

export type LogResult = { opened: Signal[]; closed: Signal[] };

// Robotning kuchli signallarini jurnalga yozadi (obunachilarga aynan shular beriladi).
// Yopilgan signal qayta o'zgartirilmaydi. Yangi ochilgan va yopilgan signallarni qaytaradi.
export async function logSignals(signals: Signal[]): Promise<LogResult> {
  const out: LogResult = { opened: [], closed: [] };
  for (const s of signals) {
    if (!s.side || s.tp1 == null || s.tp2 == null || s.sl == null) continue;
    const status = s.status ?? "active";
    const strategy = s.strategy ?? "trend";
    const r_ = s.resultR !== undefined ? s.resultR : resultR(s.status);
    if (s.quality === "strong") {
      // Reyting faqat yangi signal yozilayotganda xotiradan hisoblanadi; mavjud qatorda o'zgarmaydi.
      const exists = await sql("SELECT 1 FROM signal_log WHERE pair = $1 AND timeframe = $2 AND signal_time = $3 AND strategy = $4", [s.pair, s.timeframe, new Date(s.candleTime), strategy]);
      // Gerakl o'chiq: yangi signal yozilmaydi, avval ochilgani esa yopilguncha yangilanadi.
      if (!exists.length && strategy.startsWith("scalp") && !geraklEnabled()) continue;
      // O'chirilgan bozor (ROBOT_MARKETS da yo'q): yangi signal yozilmaydi, faqat ochiq qolgani yopiladi.
      if (!exists.length && !activeCategories().includes(s.category)) continue;
      const r = exists.length ? null
        : !publicCategories().includes(s.category) ? { rating: "C" as const, n: null, est: null }
        : strategy === "trend" ? await rateFromMemory(s.pair, s.timeframe, s.side, s.confidence)
        // Gerakl sinovi kichik (30 kun, 29 savdo): GERAKL_PUBLIC=1 qilinmaguncha faqat admin va demo hisob (C).
        : strategy.startsWith("scalp") && process.env.GERAKL_PUBLIC !== "1" ? { rating: "C" as const, n: null, est: null }
        : await ratePipsFromMemory(s.pair, strategy);
      const rows = await sql<{ inserted: boolean }>(
        `INSERT INTO signal_log (pair, category, timeframe, side, entry, tp1, tp2, sl, confidence, signal_time, status, result_r,
                                 rating, memory_n, memory_winrate, strategy, zeus)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         ON CONFLICT (pair, timeframe, signal_time, strategy) DO UPDATE
           SET status = EXCLUDED.status, result_r = EXCLUDED.result_r, updated_at = now()
         WHERE signal_log.status = 'active' AND EXCLUDED.status <> 'active'
         RETURNING (xmax = 0) AS inserted`,
        [s.pair, s.category, s.timeframe, s.side, s.entry, s.tp1, s.tp2, s.sl, s.confidence,
          new Date(s.candleTime), status, r_, r?.rating ?? null, r?.n ?? null, r?.est ?? null, strategy,
          // Zeus nimaga asoslandi: admin tahlil sahifasi uchun.
          JSON.stringify({ reasons: s.reasons, rsi: s.rsi, trend: s.trend, context: s.context ?? null, newsRisk: s.newsRisk ?? null })],
      );
      if (rows[0]?.inserted && status === "active") {
        out.opened.push(s);
        // Yangi signal yozilishi bilan adminga Telegram xabari (barcha reytinglar, C ham).
        await notifyAdmin(signalMessage(s, r?.rating ?? null));
      } else if (rows[0] && status !== "active") {
        out.closed.push(s);
        await notifyAdmin(closedMessage(s));
      }
    } else if (status !== "active") {
      // Avval kuchli deb yozilgan signal keyinchalik (masalan yangilik tufayli) kuchsiz ko'rinsa ham natijasi yoziladi.
      const rows = await sql(
        `UPDATE signal_log SET status = $4, result_r = $5, updated_at = now()
         WHERE pair = $1 AND timeframe = $2 AND signal_time = $3 AND strategy = $6 AND status = 'active' RETURNING id`,
        [s.pair, s.timeframe, new Date(s.candleTime), status, r_, strategy],
      );
      if (rows.length) {
        out.closed.push(s);
        await notifyAdmin(closedMessage(s));
      }
    }
  }
  return out;
}

export type Stats = { timeframe: Timeframe | "ALL"; closed: number; wins: number; winRate: number; profitFactor: number | null; totalR: number };

// Ochiq natijalar faqat mijozlarga ochiq bozorlar bo'yicha (standart: PUBLIC_CATEGORIES).
export async function trackRecord(days = 90, categories: string[] = publicCategories()): Promise<Stats[]> {
  const rows = await sql<{ timeframe: string; closed: string; wins: string; gain: number | null; loss: number | null; total: number | null }>(
    `SELECT coalesce(timeframe, 'ALL') AS timeframe,
            count(*) AS closed,
            count(*) FILTER (WHERE result_r > 0) AS wins,
            sum(result_r) FILTER (WHERE result_r > 0) AS gain,
            -sum(result_r) FILTER (WHERE result_r < 0) AS loss,
            sum(result_r) AS total
     FROM signal_log
     WHERE status <> 'active' AND signal_time > now() - make_interval(days => $1) AND category = ANY($2)
     GROUP BY ROLLUP (timeframe)`,
    [days, categories],
  );
  return rows.map((r) => {
    const closed = Number(r.closed);
    const wins = Number(r.wins);
    return {
      timeframe: r.timeframe as Stats["timeframe"],
      closed,
      wins,
      winRate: closed ? wins / closed : 0,
      profitFactor: r.loss ? Number(r.gain ?? 0) / Number(r.loss) : null,
      totalR: Number(r.total ?? 0),
    };
  });
}

export type LoggedSignal = {
  id: number; pair: string; timeframe: string; strategy: string; side: string; entry: number; tp1: number; tp2: number; sl: number;
  signal_time: Date; status: string; result_r: number | null;
};

export async function recentClosed(limit = 30, categories: string[] = publicCategories()): Promise<LoggedSignal[]> {
  return sql<LoggedSignal>(
    `SELECT id, pair, timeframe, strategy, side, entry, tp1, tp2, sl, signal_time, status, result_r
     FROM signal_log WHERE status <> 'active' AND category = ANY($2) ORDER BY signal_time DESC LIMIT $1`,
    [limit, categories],
  );
}

export type RecentSignal = {
  pair: string; timeframe: string; strategy: string; signal_time: Date; day: string; rating: string | null; memory_n: number | null; memory_winrate: number | null;
  ai_verdict: string | null; ai_confidence: number | null; ai_note: string | null;
};

// So'nggi 2 kunning kuchli signallari, Toshkent kuni bilan, vaqt tartibida (kunlik limit shu ro'yxatdan hisoblanadi).
export async function recentSignals(): Promise<RecentSignal[]> {
  return sql<RecentSignal>(
    `SELECT pair, timeframe, strategy, signal_time, rating, memory_n, memory_winrate, ai_verdict, ai_confidence, ai_note,
            to_char(signal_time AT TIME ZONE 'Asia/Tashkent', 'YYYY-MM-DD') AS day
     FROM signal_log WHERE signal_time > now() - interval '48 hours'
     ORDER BY signal_time, id`,
  );
}
