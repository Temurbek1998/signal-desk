import "server-only";
import { sql } from "./db.ts";

// Kunlik AI chaqiruvlari chegarasi (Anthropic hisobidagi oylik limit tugab qolmasligi uchun).
// Mijozga ta'sir qiladigan baho (oltin signalini tasdiqlash) chegarasiz; demo qarorlar va admin ko'rinishlari chegarada to'xtaydi.
// AI_DAILY_CALLS (standart 40): taxminan oyiga $50 atrofida.
export async function aiCallsToday(): Promise<number> {
  const [r] = await sql<{ n: string }>(
    `SELECT (SELECT count(*) FROM ai_trades WHERE at >= date_trunc('day', now()))
          + (SELECT count(*) FROM ai_views WHERE at >= date_trunc('day', now()))
          + (SELECT count(*) FROM signal_log WHERE ai_at >= date_trunc('day', now())) AS n`,
  );
  return Number(r?.n ?? 0);
}

export const dailyLimit = () => Math.max(1, Number(process.env.AI_DAILY_CALLS ?? 40));
export async function underBudget() {
  return (await aiCallsToday()) < dailyLimit();
}
