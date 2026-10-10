import { db, sql } from "@/lib/server/db.ts";
import { APP_COMMIT, APP_VERSION } from "@/lib/version.ts";

// Sayt va baza holatini tekshirish. Ulanish satri yoki parol hech qachon qaytarilmaydi.
export const dynamic = "force-dynamic";

export async function GET() {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    ADMIN_EMAIL: Boolean(process.env.ADMIN_EMAIL),
    ADMIN_PATH: Boolean(process.env.ADMIN_PATH),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    MAIL_PROVIDER: process.env.MAIL_PROVIDER ?? null,
    TWELVEDATA_API_KEY: Boolean(process.env.TWELVEDATA_API_KEY),
    ROBOT_MARKETS: process.env.ROBOT_MARKETS ?? null,
    AI_KEY: process.env.ANTHROPIC_API_KEY ? "anthropic" : process.env.GEMINI_API_KEY ? "gemini" : process.env.DEEPSEEK_API_KEY ? "deepseek" : null,
  };
  try {
    const t = Date.now();
    await (await db()).query("SELECT 1");
    const ms = Date.now() - t;
    // Robot holati: faqat sonlar va narx olish xatolari, signal tafsilotlari (pullik ma'lumot) chiqmaydi.
    const runs = await sql<{ at: Date; trigger: string; analyzed: number; failed: number; strong: number; weak: number; errors: string }>(
      "SELECT started_at AS at, trigger, analyzed, failed, strong, weak, left(errors, 600) AS errors FROM robot_runs ORDER BY started_at DESC LIMIT 3",
    );
    const [counts] = await sql<{ signals: string; open_signals: string; demo: string; demo_open: string; states: string; ai_trades: string; ai_decisions: string; ai_views: string; ai_reviews: string; ai_trade_reviews: string; news_reactions: string; price_spikes: string }>(
      `SELECT (SELECT count(*) FROM signal_log) AS signals,
              (SELECT count(*) FROM signal_log WHERE status = 'active') AS open_signals,
              (SELECT count(*) FROM demo_trades) AS demo,
              (SELECT count(*) FROM demo_trades WHERE status = 'open') AS demo_open,
              (SELECT count(*) FROM robot_state) AS states,
              (SELECT count(*) FROM ai_trades WHERE status NOT IN ('wait', 'rejected')) AS ai_trades,
              (SELECT count(*) FROM ai_trades) AS ai_decisions,
              (SELECT count(*) FROM ai_views) AS ai_views,
              (SELECT count(*) FROM signal_log WHERE ai_verdict IS NOT NULL) AS ai_reviews,
              (SELECT count(*) FROM ai_trade_reviews) AS ai_trade_reviews,
              (SELECT count(*) FROM news_reactions WHERE status <> 'pending') AS news_reactions,
              (SELECT count(*) FROM price_spikes) AS price_spikes`,
    );
    // Bozorlar sinovi: faqat umumiy tarixiy natija (savdolar soni, o'rtacha R, xulosa), signal tafsilotlari emas.
    const [mt] = await sql<{ at: Date; rows: { pair: string; tf: string; days: number; trades: number; avgR: number; half1: number; half2: number; verdict: string }[]; errors: string }>(
      "SELECT at, rows, left(errors, 400) AS errors FROM market_test ORDER BY at DESC LIMIT 1",
    ).catch(() => []);
    const marketTest = mt ? { at: mt.at, errors: mt.errors, rows: mt.rows.map((r) => `${r.pair} ${r.tf} (${r.days} kun): ${r.trades} savdo, ${r.avgR.toFixed(3)}R (${r.half1.toFixed(2)}/${r.half2.toFixed(2)}) ${r.verdict}`) } : null;
    return Response.json({ version: APP_VERSION, commit: APP_COMMIT, db: "ok", ms, env, robot: { runs, counts }, marketTest });
  } catch (e) {
    const err = e as { message?: string; code?: string };
    const message = String(err.message ?? e).replace(/postgres(ql)?:\/\/\S+/gi, "[url]").replace(/npg_\w+/g, "[parol]");
    return Response.json({ version: APP_VERSION, commit: APP_COMMIT, db: "error", code: err.code ?? null, message, env });
  }
}
