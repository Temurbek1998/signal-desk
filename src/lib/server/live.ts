import "server-only";
import { activeStop, pipSize, resultAt, toPips, type StopMove } from "../aiTrade.ts";
import { activeInstruments, ALL_INSTRUMENTS } from "../instruments.ts";
import { getLastPrice } from "../market.ts";
import type { TradeReview } from "./aiManager.ts";
import { sql } from "./db.ts";

// Admin "Jonli savdolar": oltin va har valyuta alohida. Claude (kun ichi, swing) va Zeus ochiq savdolari joriy narx bilan:
// amaldagi SL qayerda, SL gacha necha pips, savdo necha pips yurdi va demo hisobda qancha USDT (suzuvchi). Pastida 30 kunlik
// yopilgan natija (pips, R, USDT) har manba bo'yicha va Claude nazorat logi.

export type LiveTrade = {
  key: string; source: "claude" | "swing" | "zeus"; label: string; id: number; pair: string; side: "BUY" | "SELL";
  entry: number; sl0: number; stop: number; tp1: number; tp2: number; tp1Hit: boolean; slMoved: boolean; openedAt: Date;
  price: number | null; pips: number | null; toSlPips: number | null; riskPips: number; r: number | null; usdt: number | null; lots: number | null;
  review: TradeReview | null;
};

export type SourceStats = { source: "claude" | "swing" | "zeus"; trades: number; wins: number; pips: number; r: number; usdt: number | null };

export type PairLive = { pair: string; price: number | null; priceAt: number | null; trades: LiveTrade[]; stats: SourceStats[] };

type AiRow = {
  id: number; at: Date; pair: string; action: "BUY" | "SELL"; status: string; entry: number; sl: number; tp1: number; tp2: number; tp1_hit: boolean;
  mode: string; stops: StopMove[] | null; risk_usdt: number | null; lots: number | null;
};
type ZeusRow = {
  id: number; signal_time: Date; pair: string; timeframe: string; strategy: string | null; side: "BUY" | "SELL"; entry: number; sl: number; tp1: number; tp2: number;
  risk_usdt: number | null; lots: number | null;
};
type StatRow = { pair: string; source: "claude" | "swing" | "zeus"; n: string; wins: string; r: number | null; dist: number | null; usdt: number | null };

const SOURCE_LABEL = { claude: "Claude kun ichi", swing: "Claude swing", zeus: "Zeus" } as const;

export async function liveBoard(days = 30): Promise<{ pairs: PairLive[]; reviews: (TradeReview & { side: string; mode: string })[] }> {
  const [ai, zeus, stats, reviews] = await Promise.all([
    sql<AiRow>(
      `SELECT a.id, a.at, a.pair, a.action, a.status, a.entry, a.sl, a.tp1, a.tp2, a.tp1_hit, a.mode, a.stops, d.risk_usdt, d.lots
       FROM ai_trades a LEFT JOIN demo_trades d ON d.ai_trade_id = a.id
       WHERE a.status IN ('open', 'tp1') ORDER BY a.at`,
    ),
    sql<ZeusRow>(
      `SELECT l.id, l.signal_time, l.pair, l.timeframe, l.strategy, l.side, l.entry, l.sl, l.tp1, l.tp2, d.risk_usdt, d.lots
       FROM signal_log l LEFT JOIN demo_trades d ON d.signal_id = l.id
       WHERE l.status = 'active' ORDER BY l.signal_time`,
    ),
    sql<StatRow>(
      `SELECT a.pair, CASE a.mode WHEN 'swing' THEN 'swing' ELSE 'claude' END AS source, count(*) AS n,
              count(*) FILTER (WHERE a.result_r > 0) AS wins, sum(a.result_r) AS r, sum(a.result_r * abs(a.entry - a.sl)) AS dist, sum(d.pnl) AS usdt
       FROM ai_trades a LEFT JOIN demo_trades d ON d.ai_trade_id = a.id AND d.status = 'closed'
       WHERE a.result_r IS NOT NULL AND coalesce(a.closed_at, a.updated_at) > now() - make_interval(days => $1)
       GROUP BY 1, 2
       UNION ALL
       SELECT l.pair, 'zeus', count(*), count(*) FILTER (WHERE l.result_r > 0), sum(l.result_r), sum(l.result_r * abs(l.entry - l.sl)), sum(d.pnl)
       FROM signal_log l LEFT JOIN demo_trades d ON d.signal_id = l.id AND d.status = 'closed'
       WHERE l.status <> 'active' AND l.result_r IS NOT NULL AND l.signal_time > now() - make_interval(days => $1)
       GROUP BY 1`,
      [days],
    ),
    sql<TradeReview & { side: string; mode: string }>(
      `SELECT r.*, a.action AS side, a.mode FROM ai_trade_reviews r JOIN ai_trades a ON a.id = r.trade_id ORDER BY r.at DESC LIMIT 80`,
    ),
  ]);
  const lastReview = new Map<number, TradeReview>();
  for (const r of reviews) if (!lastReview.has(r.trade_id)) lastReview.set(r.trade_id, r);

  // Kerakli juftliklar: faol bozorlar (oltin birinchi) va ochiq savdosi yoki natijasi bor boshqalar.
  const wanted = new Set([...activeInstruments().map((i) => i.pair), ...ai.map((t) => t.pair), ...zeus.map((t) => t.pair), ...stats.map((s) => s.pair)]);
  const order = ALL_INSTRUMENTS.map((i) => i.pair).filter((p) => wanted.has(p));
  const prices = new Map(await Promise.all(order.map(async (pair) => {
    const inst = ALL_INSTRUMENTS.find((i) => i.pair === pair)!;
    return [pair, await getLastPrice(inst).catch(() => null)] as const;
  })));

  const make = (source: LiveTrade["source"], id: number, pair: string, side: "BUY" | "SELL", entry: number, sl0: number, tp1: number, tp2: number,
    tp1Hit: boolean, stops: StopMove[], openedAt: Date, riskUsdt: number | null, lots: number | null, label: string): LiveTrade => {
    const dir = side === "BUY" ? 1 : -1;
    const stop = activeStop(tp1Hit ? entry : sl0, dir, stops);
    const price = prices.get(pair)?.price ?? null;
    const plan = { side, entry, sl: sl0, tp1, tp2 };
    const r = price == null ? null : resultAt(plan, price, tp1Hit);
    return {
      key: `${source}${id}`, source, label, id, pair, side, entry, sl0, stop, tp1, tp2, tp1Hit, slMoved: stop !== (tp1Hit ? entry : sl0), openedAt,
      price, pips: price == null ? null : toPips(pair, (price - entry) * dir), toSlPips: price == null ? null : toPips(pair, (price - stop) * dir),
      riskPips: Math.abs(entry - sl0) / pipSize(pair), r, usdt: r == null || riskUsdt == null ? null : r * Number(riskUsdt), lots: lots == null ? null : Number(lots),
      review: source === "zeus" ? null : lastReview.get(id) ?? null,
    };
  };
  const trades: LiveTrade[] = [
    ...ai.map((t) => make(t.mode === "swing" ? "swing" : "claude", t.id, t.pair, t.action, +t.entry, +t.sl, +t.tp1, +t.tp2, t.tp1_hit, t.stops ?? [], t.at,
      t.risk_usdt, t.lots, SOURCE_LABEL[t.mode === "swing" ? "swing" : "claude"])),
    // Zeus signallari jurnalda TP1 ni alohida belgilamaydi: suzuvchi natija to'liq hajm bo'yicha ko'rsatiladi.
    ...zeus.map((t) => make("zeus", t.id, t.pair, t.side, +t.entry, +t.sl, +t.tp1, +t.tp2, false, [], t.signal_time, t.risk_usdt, t.lots,
      `Zeus ${t.timeframe}${t.strategy && t.strategy !== "trend" ? ` · ${t.strategy}` : ""}`)),
  ];

  const pairs = order.map((pair): PairLive => ({
    pair, price: prices.get(pair)?.price ?? null, priceAt: prices.get(pair)?.t ?? null,
    trades: trades.filter((t) => t.pair === pair),
    stats: (["claude", "swing", "zeus"] as const).map((source) => {
      const s = stats.find((x) => x.pair === pair && x.source === source);
      return { source, trades: Number(s?.n ?? 0), wins: Number(s?.wins ?? 0), r: Number(s?.r ?? 0), pips: toPips(pair, Number(s?.dist ?? 0)), usdt: s?.usdt == null ? null : Number(s.usdt) };
    }),
  }));
  return { pairs, reviews };
}

export const sourceLabel = (s: LiveTrade["source"]) => SOURCE_LABEL[s];
