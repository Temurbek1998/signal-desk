import "server-only";
import { weakReason } from "../engine.ts";
import { runRobot } from "../robot.ts";
import { signalLabel, TIMEFRAMES, type Signal, type Timeframe } from "../types.ts";
import { sql } from "./db.ts";
import { logSignals } from "./track.ts";
import { syncDemo } from "./demo.ts";

const STATUS_TEXT: Record<string, string> = { tp1: "TP 1 urildi", tp2: "TP 2 urildi", sl: "SL urildi", close: "kun oxirida yopildi" };
const label = (s: Signal) => `${signalLabel(s.strategy)}: `;

function reasonOf(s: Signal): string {
  if (!s.side) return s.rejected ?? "Signal yo'q";
  if (s.status !== "active") return `Oxirgi signal ${s.barsAgo} sham oldin: ${STATUS_TEXT[s.status ?? ""] ?? s.status}`;
  const weak = weakReason(s, !!s.newsRisk);
  return weak ? `Kuchsiz ${s.side}: ${weak}` : `Kuchli ${s.side}, ishonch ${s.confidence}%`;
}

async function event(kind: string, message: string, pair?: string, tf?: Timeframe) {
  await sql("INSERT INTO robot_events (kind, pair, timeframe, message) VALUES ($1, $2, $3, $4)", [kind, pair ?? null, tf ?? null, message]);
}

// Robotning bitta to'liq aylanishi: barcha taymfreymlar, jurnal, holat va hodisalar.
export async function runCycle(trigger: string, timeframes: Timeframe[] = TIMEFRAMES) {
  const started = new Date();
  let analyzed = 0, failed = 0, strong = 0, weak = 0;
  const errors: string[] = [];

  const contexts = new Map<string, Signal["context"]>();
  // O'chirilgan bozorlarda ochiq qolgan signallar ham yopilguncha kuzatiladi.
  const open = await sql<{ pair: string }>("SELECT DISTINCT pair FROM signal_log WHERE status = 'active'");
  const keep = open.map((o) => o.pair);
  for (const tf of timeframes) {
    const r = await runRobot(tf, keep);
    for (const s of r.signals) if (s.context && Object.keys(s.context).length) contexts.set(s.pair, s.context);
    failed += r.errors.length;
    for (const e of r.errors) errors.push(`${tf} ${e.pair}: ${e.message}`);
    const logged = await logSignals(r.signals);

    for (const s of r.signals) {
      analyzed++;
      const live = s.side && s.status === "active";
      if (live && s.quality === "strong") strong++;
      else if (live) weak++;
      // Robot holati jadvali juftlik+taymfreym bo'yicha: asosiy (trend) tahlil yoziladi, pips signallari jurnal va hodisalarda.
      if (s.strategy && s.strategy !== "trend") continue;
      await sql(
        `INSERT INTO robot_state (pair, timeframe, updated_at, side, quality, status, confidence, price, reason)
         VALUES ($1, $2, now(), $3, $4, $5, $6, $7, $8)
         ON CONFLICT (pair, timeframe) DO UPDATE SET updated_at = now(), side = EXCLUDED.side, quality = EXCLUDED.quality,
           status = EXCLUDED.status, confidence = EXCLUDED.confidence, price = EXCLUDED.price, reason = EXCLUDED.reason`,
        [s.pair, tf, s.side, s.side ? s.quality ?? null : null, s.status, s.confidence, s.price, reasonOf(s)],
      );
    }
    for (const s of logged.opened) {
      await event("signal", `${label(s)}Yangi kuchli ${s.side}: kirish ${s.entry}, TP1 ${s.tp1}, TP2 ${s.tp2}, SL ${s.sl}, ishonch ${s.confidence}%`, s.pair, tf);
    }
    for (const s of logged.closed) {
      await event("closed", `${label(s)}${s.side} signali yopildi: ${STATUS_TEXT[s.status ?? ""] ?? s.status}`, s.pair, tf);
    }
    // Bir xil xato har 5 daqiqada takrorlanmasin: juftlik va taymfreym bo'yicha soatiga bir marta.
    for (const e of r.errors) {
      await sql(
        `INSERT INTO robot_events (kind, pair, timeframe, message)
         SELECT 'error', $1, $2, $3 WHERE NOT EXISTS (
           SELECT 1 FROM robot_events WHERE kind = 'error' AND pair = $1 AND timeframe = $2 AND at > now() - interval '1 hour')`,
        [e.pair, tf, `Narx olinmadi: ${e.message}`],
      );
    }
  }

  // Bozor manzarasi (H4, D1, W1, MN) admin sahifasi uchun.
  for (const [pair, ctx] of contexts) {
    for (const [k, trend] of Object.entries(ctx ?? {})) {
      await sql(
        `INSERT INTO market_context (pair, timeframe, trend, updated_at) VALUES ($1, $2, $3, now())
         ON CONFLICT (pair, timeframe) DO UPDATE SET trend = EXCLUDED.trend, updated_at = now()`,
        [pair, k, trend],
      );
    }
  }

  // Demo hisob: robot o'z signallariga virtual savdo ochadi va yopadi.
  try {
    const demo = await syncDemo();
    const usd = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)} USDT`;
    for (const t of demo.opened) {
      await event("demo", `Demo savdo ochildi: ${t.side}, risk ${Number(t.risk_usdt).toFixed(2)} USDT, hajm ${Number(t.size).toPrecision(4)}`, t.pair, t.timeframe as Timeframe);
    }
    for (const t of demo.closed) {
      await event("demo", `Demo savdo yopildi: ${t.outcome?.toUpperCase()}, ${usd(Number(t.pnl))}, balans ${Number(t.balance_after).toFixed(2)} USDT`, t.pair, t.timeframe as Timeframe);
    }
  } catch (e) {
    errors.push(`demo: ${(e as Error).message}`);
  }

  await sql(
    `INSERT INTO robot_runs (started_at, finished_at, trigger, analyzed, failed, strong, weak, errors)
     VALUES ($1, now(), $2, $3, $4, $5, $6, $7)`,
    [started, trigger, analyzed, failed, strong, weak, errors.slice(0, 20).join("\n")],
  );
  // Jurnal cheksiz o'smasin.
  await sql("DELETE FROM robot_runs WHERE started_at < now() - interval '14 days'");
  await sql("DELETE FROM robot_events WHERE at < now() - interval '30 days'");
  return { analyzed, failed, strong, weak, errors };
}
