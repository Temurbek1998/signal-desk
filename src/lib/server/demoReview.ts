import "server-only";
import { outcomeNote } from "../demoNote.ts";
import { ALL_INSTRUMENTS } from "../instruments.ts";
import { getCandles } from "../market.ts";
import { underBudget } from "./aiBudget.ts";
import { ohlc } from "./aiTrader.ts";
import { digitsOf } from "./analysis.ts";
import { sql } from "./db.ts";
import { complete, provider } from "./llm.ts";

// Yopilgan demo savdo sababi (egasining talabi, 2026-10-10): savdo yopilgach Claude (DEMO_REVIEW_MODEL, standart Sonnet)
// kirish sababi, Claude nazorat logi va savdo davomidagi shamlarga qarab 2-4 jumlada nega foyda yoki zarar bo'lganini yozadi.
// demo_trades.review, admin "Demo hisob". Cron'da aylanishda 2 tagacha, kunlik AI chegarasi ichida. O'chirish: DEMO_REVIEW=0.

export const demoReviewEnabled = () => process.env.DEMO_REVIEW !== "0" && !!provider();

type Row = {
  id: number; pair: string; side: string; timeframe: string; strategy: string | null; entry: number; sl: number; tp1: number | null; tp2: number | null;
  lots: number | null; opened_at: Date; closed_at: Date; outcome: string | null; result_r: number | null; pnl: number | null;
  signal_id: number | null; ai_trade_id: number | null;
  ai_reason: string | null; ai_note: string | null; ai_conf: number | null; exit_price: number | null; mode: string | null;
  zeus: { reasons?: string[]; trend?: string; rsi?: number } | null; z_verdict: string | null; z_note: string | null;
};

const SYSTEM = `Sen tajribali treyder-murabbiysan. Demo hisobda yopilgan bitta savdoni tahlil qilasan.
O'zbek tilida (lotin), 2-4 jumla: savdo nega foyda yoki zarar bilan tugadi. Kirish sababi to'g'ri chiqdimi, narx qaysi
darajaga borib qaytdi yoki davom etdi (pips bilan), SL yoki TP joylashuvi to'g'rimidi, va keyingi safar nimani boshqacha
qilish kerak. Faqat berilgan ma'lumotga tayan, taxmin qilsang shuni ayt. Oltinda 1 pip = 0.10 $. Sarlavha va ro'yxat yozma.`;

export async function demoReviews(max = 2): Promise<number> {
  if (!demoReviewEnabled()) return 0;
  // Navbatdagilar: oxirgi 3 kunda yopilgan, hali sababi yozilmagan.
  const queue = await sql<{ id: number }>(
    `SELECT id FROM demo_trades WHERE status = 'closed' AND review_at IS NULL AND closed_at > now() - interval '3 days' ORDER BY closed_at LIMIT $1`, [max],
  );
  if (!queue.length || !(await underBudget())) return 0;
  let n = 0;
  for (const q of queue) {
    // Ikki cron bir vaqtda bo'lsa bitta savdo bir marta.
    const [claimed] = await sql<{ id: number }>("UPDATE demo_trades SET review_at = now() WHERE id = $1 AND review_at IS NULL RETURNING id", [q.id]);
    if (!claimed) continue;
    const [t] = await sql<Row>(
      `SELECT d.id, d.pair, d.side, d.timeframe, d.strategy, d.entry, d.sl, coalesce(d.tp1, l.tp1) AS tp1, coalesce(d.tp2, l.tp2) AS tp2, d.lots,
              d.opened_at, d.closed_at, d.outcome, d.result_r, d.pnl, d.signal_id, d.ai_trade_id,
              a.reason AS ai_reason, a.note AS ai_note, a.confidence AS ai_conf, a.exit_price, a.mode,
              l.zeus, l.ai_verdict AS z_verdict, l.ai_note AS z_note
       FROM demo_trades d LEFT JOIN ai_trades a ON a.id = d.ai_trade_id LEFT JOIN signal_log l ON l.id = d.signal_id WHERE d.id = $1`, [q.id],
    );
    if (!t) continue;
    const text = await explain(t).catch((e) => `Sabab yozilmadi: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    await sql("UPDATE demo_trades SET review = $2 WHERE id = $1", [t.id, text]);
    n++;
  }
  return n;
}

async function explain(t: Row): Promise<string> {
  const inst = ALL_INSTRUMENTS.find((i) => i.pair === t.pair);
  const open = new Date(t.opened_at).getTime(), close = new Date(t.closed_at).getTime();
  // Uzoq savdoda (swing) H1, aks holda M15. Savdodan 3 soat oldin va 1 soat keyin.
  const minutes = close - open > 40 * 3600_000 ? 60 : 15;
  const candles = inst ? await getCandles(inst, minutes).catch(() => []) : [];
  const d = digitsOf(t.pair, Number(t.entry));
  const reviews = t.ai_trade_id
    ? await sql<{ at: Date; price: number; action: string; new_sl: number | null; reason: string }>(
      "SELECT at, price, action, new_sl, reason FROM ai_trade_reviews WHERE trade_id = $1 ORDER BY at", [t.ai_trade_id])
    : [];
  const data = {
    juftlik: t.pair, manba: t.ai_trade_id ? (t.mode === "swing" ? "Claude swing" : "Claude kun ichi") : `Zeus ${t.timeframe} (${t.strategy ?? "trend"})`,
    savdo: {
      yonalish: t.side, kirish: t.entry, sl: t.sl, tp1: t.tp1, tp2: t.tp2, lot: t.lots,
      ochilgan_utc: new Date(open).toISOString(), yopilgan_utc: new Date(close).toISOString(), chiqish_narxi: t.exit_price,
    },
    natija: outcomeNote(t).text,
    kirish_sababi: t.ai_trade_id
      ? { claude_sababi: t.ai_reason, izoh: t.ai_note, ishonch: t.ai_conf }
      : { zeus_sabablari: t.zeus?.reasons ?? [], trend: t.zeus?.trend, rsi: t.zeus?.rsi, claude_bahosi: t.z_verdict, claude_izohi: t.z_note },
    claude_nazorati: reviews.map((r) => ({ vaqt: r.at, narx: r.price, qaror: r.action, yangi_sl: r.new_sl, sabab: r.reason })),
    shamlar_taymfreymi: minutes === 60 ? "H1" : "M15",
    shamlar_ustunlari: "vaqt_utc, open, high, low, close",
    shamlar: ohlc(candles.filter((c) => c.t >= open - 3 * 3600_000 && c.t <= close + 3600_000), d),
  };
  const model = process.env.DEMO_REVIEW_MODEL || (provider() === "anthropic" ? "claude-sonnet-5-5" : undefined);
  const out = await complete(SYSTEM, [{ role: "user", content: JSON.stringify(data) }], { model, maxTokens: 900 });
  return out.trim().slice(0, 1500);
}
