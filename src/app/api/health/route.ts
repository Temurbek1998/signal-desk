import { db, sql } from "@/lib/server/db.ts";

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
  };
  try {
    const t = Date.now();
    await (await db()).query("SELECT 1");
    const ms = Date.now() - t;
    // Robot holati: faqat sonlar va narx olish xatolari, signal tafsilotlari (pullik ma'lumot) chiqmaydi.
    const runs = await sql<{ at: Date; trigger: string; analyzed: number; failed: number; strong: number; weak: number; errors: string }>(
      "SELECT started_at AS at, trigger, analyzed, failed, strong, weak, left(errors, 600) AS errors FROM robot_runs ORDER BY started_at DESC LIMIT 3",
    );
    const [counts] = await sql<{ signals: string; open_signals: string; demo: string; demo_open: string; states: string }>(
      `SELECT (SELECT count(*) FROM signal_log) AS signals,
              (SELECT count(*) FROM signal_log WHERE status = 'active') AS open_signals,
              (SELECT count(*) FROM demo_trades) AS demo,
              (SELECT count(*) FROM demo_trades WHERE status = 'open') AS demo_open,
              (SELECT count(*) FROM robot_state) AS states`,
    );
    return Response.json({ db: "ok", ms, env, robot: { runs, counts } });
  } catch (e) {
    const err = e as { message?: string; code?: string };
    const message = String(err.message ?? e).replace(/postgres(ql)?:\/\/\S+/gi, "[url]").replace(/npg_\w+/g, "[parol]");
    return Response.json({ db: "error", code: err.code ?? null, message, env });
  }
}
