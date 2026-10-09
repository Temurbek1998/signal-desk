import "server-only";
import { dailyStats, demoConfig, lotsOf, maxDrawdown, pnlOf, position, strategyStats, type DayRow, type StrategyRow } from "../paper.ts";
import { sql } from "./db.ts";

export type DemoTrade = {
  id: number; pair: string; category: string; timeframe: string; strategy: string; side: string; rating: string | null; entry: number; sl: number; tp1: number | null; tp2: number | null; lots: number | null;
  opened_at: Date; risk_usdt: number; size: number; notional: number; fee: number; status: "open" | "closed";
  outcome: string | null; result_r: number | null; pnl: number | null; closed_at: Date | null; balance_after: number | null;
};

async function closedBalance(start: number): Promise<number> {
  const [r] = await sql<{ s: number | null }>("SELECT sum(pnl) AS s FROM demo_trades WHERE status = 'closed'");
  return start + Number(r.s ?? 0);
}

// Robot jurnalidagi yangi A/B signallar uchun demo savdo ochadi va yopilgan signallarning savdosini yopadi.
// Takroran chaqirilsa ham bir xil natija beradi (signal_id noyob, yopish faqat ochiq savdoda).
export async function syncDemo(): Promise<{ opened: DemoTrade[]; closed: DemoTrade[] }> {
  const cfg = demoConfig();
  const fresh = await sql<{ id: number; pair: string; category: string; timeframe: string; strategy: string; side: string; rating: string | null; entry: number; sl: number; tp1: number; tp2: number; signal_time: Date }>(
    `SELECT l.id, l.pair, l.category, l.timeframe, l.strategy, l.side, l.rating, l.entry, l.sl, l.tp1, l.tp2, l.signal_time
     FROM signal_log l LEFT JOIN demo_trades d ON d.signal_id = l.id
     WHERE d.id IS NULL AND l.rating = ANY($1) AND l.signal_time > now() - interval '3 days'
     ORDER BY l.signal_time, l.id`,
    [cfg.ratings],
  );
  const opened: DemoTrade[] = [];
  for (const s of fresh) {
    const balance = await closedBalance(cfg.startBalance);
    const p = position(balance, cfg, s.category, s.entry, s.sl);
    if (p.size <= 0) continue;
    const rows = await sql<DemoTrade>(
      `INSERT INTO demo_trades (signal_id, pair, category, timeframe, side, rating, entry, sl, opened_at, balance_before, risk_usdt, size, notional, fee, tp1, tp2, lots, strategy)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       ON CONFLICT (signal_id) DO NOTHING RETURNING *`,
      [s.id, s.pair, s.category, s.timeframe, s.side, s.rating, s.entry, s.sl, s.signal_time, balance, p.risk, p.size, p.notional, p.fee, s.tp1, s.tp2, lotsOf(s.category, p.size), s.strategy],
    );
    if (rows[0]) opened.push(rows[0]);
  }

  const done = await sql<{ id: number; risk_usdt: number; fee: number; status: string; result_r: number; updated_at: Date }>(
    `SELECT d.id, d.risk_usdt, d.fee, l.status, l.result_r, l.updated_at FROM demo_trades d JOIN signal_log l ON l.id = d.signal_id
     WHERE d.status = 'open' AND l.status <> 'active' AND l.result_r IS NOT NULL ORDER BY l.updated_at, d.id`,
  );
  const closed: DemoTrade[] = [];
  for (const t of done) {
    const pnl = pnlOf(Number(t.result_r), Number(t.risk_usdt), Number(t.fee));
    const after = (await closedBalance(cfg.startBalance)) + pnl;
    const rows = await sql<DemoTrade>(
      `UPDATE demo_trades SET status = 'closed', outcome = $2, result_r = $3, pnl = $4, closed_at = $5, balance_after = $6
       WHERE id = $1 AND status = 'open' RETURNING *`,
      [t.id, t.status, t.result_r, pnl, t.updated_at, after],
    );
    if (rows[0]) closed.push(rows[0]);
  }
  return { opened, closed };
}

export type DemoSummary = {
  start: number; balance: number; returnPct: number; open: DemoTrade[]; recent: DemoTrade[];
  curve: { t: number; balance: number }[]; trades: number; wins: number; maxDd: number; fees: number; riskPct: number; since: Date | null; days: DayRow[]; strategies: StrategyRow[];
};

// Eski qatorlarda tp1/tp2/lot bo'lmasligi mumkin: signal jurnalidan va hajmdan to'ldiriladi.
const SELECT = `SELECT d.*, coalesce(d.tp1, l.tp1) AS tp1, coalesce(d.tp2, l.tp2) AS tp2,
  coalesce(d.lots, d.size / CASE d.category WHEN 'gold' THEN 100 WHEN 'forex' THEN 100000 ELSE 1 END) AS lots
  FROM demo_trades d LEFT JOIN signal_log l ON l.id = d.signal_id`;

export async function demoSummary(): Promise<DemoSummary> {
  const cfg = demoConfig();
  const [closed, open] = await Promise.all([
    sql<DemoTrade>(`${SELECT} WHERE d.status = 'closed' ORDER BY d.closed_at, d.id`),
    sql<DemoTrade>(`${SELECT} WHERE d.status = 'open' ORDER BY d.opened_at DESC`),
  ]);
  let bal = cfg.startBalance;
  const first = closed[0]?.opened_at ?? open.at(-1)?.opened_at ?? null;
  const curve = [{ t: first ? new Date(first).getTime() : Date.now(), balance: bal }];
  let fees = 0;
  for (const t of closed) {
    bal += Number(t.pnl);
    fees += Number(t.fee);
    curve.push({ t: new Date(t.closed_at!).getTime(), balance: bal });
  }
  return {
    start: cfg.startBalance,
    balance: bal,
    returnPct: ((bal - cfg.startBalance) / cfg.startBalance) * 100,
    open,
    recent: closed.slice(-100).reverse(),
    days: dailyStats(closed),
    strategies: strategyStats(closed),
    curve,
    trades: closed.length,
    wins: closed.filter((t) => Number(t.result_r) > 0).length,
    maxDd: maxDrawdown(curve.map((c) => c.balance)),
    fees,
    riskPct: cfg.riskPct,
    since: first ? new Date(first) : null,
  };
}
