import "server-only";
import { sql } from "./db.ts";

// Kunlik AI chaqiruvlari chegarasi (Anthropic hisobidagi oylik limit tugab qolmasligi uchun).
// Mijozga ta'sir qiladigan baho (oltin signalini tasdiqlash) chegarasiz; demo qarorlar va admin ko'rinishlari chegarada to'xtaydi.
// AI_DAILY_CALLS (standart 250): kun ichi qarorlar (oltin har soat, valyutalar har 2 soat) ~95, swing 7,
// ochiq savdolarni har soat qayta ko'rish ~70-140 va zaxira.
export async function aiCallsToday(): Promise<number> {
  const [r] = await sql<{ n: string }>(
    `SELECT (SELECT count(*) FROM ai_trades WHERE at >= date_trunc('day', now()))
          + (SELECT count(*) FROM ai_views WHERE at >= date_trunc('day', now()))
          -- Kun ichidagi treyder qarori ai_views ga ham yoziladi, lekin bitta chaqiruv: ikki marta sanalmaydi.
          - (SELECT count(*) FROM ai_trades WHERE mode = 'intraday' AND note NOT LIKE 'Javob o''qilmadi%' AND at >= date_trunc('day', now()))
          + (SELECT count(*) FROM signal_log WHERE ai_at >= date_trunc('day', now()))
          + (SELECT count(*) FROM ai_trade_reviews WHERE at >= date_trunc('day', now())) AS n`,
  );
  return Number(r?.n ?? 0);
}

export const dailyLimit = () => Math.max(1, Number(process.env.AI_DAILY_CALLS ?? 250));
export async function underBudget() {
  return (await aiCallsToday()) < dailyLimit();
}
