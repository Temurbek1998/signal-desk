import "server-only";
import { sql } from "./db.ts";

// 2026-10-10: Vercel'da DEMO_DATA=1 turgani uchun savdo va tahlillar sun'iy narxlarda yozilgan.
// Admin "Umumiy" sahifasidagi tugma bilan bir marta tozalanadi (foydalanuvchi, obuna, to'lov, admin logi saqlanadi).
export const WIPE_KEY = "wipe_fake_2026_10_10";
const TABLES = [
  "signal_log", "demo_trades", "ai_trades", "ai_trade_reviews", "ai_views", "robot_runs", "robot_state", "robot_events",
  "market_context", "market_test", "news_reactions", "news_impulses", "news_watch_pings", "price_spikes",
];

export async function wipeDone(): Promise<boolean> {
  const rows = await sql("SELECT 1 FROM app_settings WHERE key = $1", [WIPE_KEY]);
  return rows.length > 0;
}

export async function wipeFakeData(): Promise<void> {
  await sql(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  await sql("INSERT INTO app_settings (key, value) VALUES ($1, now()::text) ON CONFLICT (key) DO NOTHING", [WIPE_KEY]);
}
