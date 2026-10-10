import "server-only";
import { toPips } from "../aiTrade.ts";
import { ALL_INSTRUMENTS } from "../instruments.ts";
import { getM1 } from "../market.ts";
import { describe, getCalendar, type NewsEvent } from "../news.ts";
import { detectImpulse, groupByTime, IMPULSE_RULES } from "../newsReaction.ts";
import { digitsOf } from "./analysis.ts";
import { sql } from "./db.ts";
import { newsPairs } from "./newsTrader.ts";
import { notifyAdmin } from "./telegram.ts";

// Yangilik efiri kuzatuvi (egasining talabi, 2026-10-10): yangilik chiqishidan 1 daqiqa oldin boshlab NEWS_WATCH_MIN (20) daqiqa,
// nutqlarda (Speaks, Press Conference, Testifies) 60 daqiqa davomida M1 har daqiqada tekshiriladi. Ketma-ket 2-3 ta katta M1 sham
// bir tomonga ketsa (newsReaction.ts detectImpulse) adminga darhol Telegram xabari va admin "Yangilik impulslari" sahifasi.
// Claude chaqirilmaydi (tezlik uchun, qoida bo'yicha). Savdo ochilmaydi. Har daqiqalik chaqiruv: /api/news-watch (cron-job.org).
// Sozlash: NEWS_WATCH=0 o'chiradi, NEWS_WATCH_IMPACT (standart High,Medium), NEWS_IMPULSE_PIPS (60 = oltinda 6 $).

export const watchEnabled = () => process.env.NEWS_WATCH !== "0";
const impacts = () => (process.env.NEWS_WATCH_IMPACT ?? "High,Medium").split(",").map((s) => s.trim());
const SPEECH = /speaks|press conference|testifies|statement/i;
export const windowMin = (e: Pick<NewsEvent, "title">) => (SPEECH.test(e.title) ? 60 : Math.max(5, Number(process.env.NEWS_WATCH_MIN ?? 20)));
const rules = () => ({ ...IMPULSE_RULES, minPips: Number(process.env.NEWS_IMPULSE_PIPS ?? IMPULSE_RULES.minPips) });
const COOLDOWN_MIN = 5; // bir yangilikda bir tomonga takroriy xabar oralig'i

export type NewsImpulse = {
  id: number; at: Date; event_time: Date; events: { title: string; uz: string | null; impact: string }[]; pair: string; side: string;
  bars: number; move_pips: number; range_x: number | null; price: number; candle_time: Date; after_pips: number | null;
};

// Hozir kuzatuv oynasidagi yangiliklar (oxirgi chiqqan guruh).
export async function activeNews(now = Date.now()) {
  const cal = await getCalendar();
  const pairs = newsPairs();
  const live = cal.filter((e) => impacts().includes(e.impact) && e.pairs.some((p) => pairs.includes(p))
    && e.time - 60_000 <= now && now <= e.time + windowMin(e) * 60_000);
  return { group: groupByTime(live).at(-1) ?? null, calendar: cal };
}

async function ping(note: string) {
  await sql(`INSERT INTO news_watch_pings (id, at, note) VALUES (1, now(), $1) ON CONFLICT (id) DO UPDATE SET at = now(), note = $1`, [note]);
}

export async function newsWatch(): Promise<{ watching: string | null; alerts: number }> {
  if (!watchEnabled()) return { watching: null, alerts: 0 };
  const { group } = await activeNews();
  // 15 daqiqadan keyingi natija hali yozilmagan impulslar (oxirgi 3 soat).
  const pending = await sql<NewsImpulse>(
    "SELECT * FROM news_impulses WHERE after_pips IS NULL AND candle_time < now() - interval '16 minutes' AND candle_time > now() - interval '3 hours'",
  );
  if (!group && !pending.length) {
    await ping("Yangilik yo'q, kutish");
    return { watching: null, alerts: 0 };
  }
  let alerts = 0;
  const names = group ? group.events.map((e) => describe(e.title) ?? e.title).join(", ") : "";
  for (const pair of newsPairs()) {
    const inst = ALL_INSTRUMENTS.find((i) => i.pair === pair)!;
    const mine = pending.filter((p) => p.pair === pair);
    const relevant = group && group.events.some((e) => e.pairs.includes(pair));
    if (!relevant && !mine.length) continue;
    const m1 = await getM1(inst, 200);
    for (const p of mine) {
      const t = new Date(p.candle_time).getTime() + 15 * 60_000;
      const c = m1.find((x) => x.t >= t);
      if (!c) continue;
      const dir = p.side === "BUY" ? 1 : -1;
      await sql("UPDATE news_impulses SET after_pips = $2 WHERE id = $1", [p.id, Math.round(toPips(pair, (c.c - Number(p.price)) * dir) * 10) / 10]);
    }
    if (!relevant) continue;
    const imp = detectImpulse(pair, m1, group!.time, rules());
    if (!imp) continue;
    const [recent] = await sql<{ id: number }>(
      "SELECT id FROM news_impulses WHERE pair = $1 AND event_time = $2 AND side = $3 AND at > now() - make_interval(mins => $4)",
      [pair, new Date(group!.time), imp.side, COOLDOWN_MIN],
    );
    if (recent) continue;
    const [row] = await sql<NewsImpulse>(
      `INSERT INTO news_impulses (event_time, events, pair, side, bars, move_pips, range_x, price, candle_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (pair, candle_time) DO NOTHING RETURNING *`,
      [new Date(group!.time), JSON.stringify(group!.events.map((e) => ({ title: e.title, uz: describe(e.title), impact: e.impact }))),
        pair, imp.side, imp.bars, imp.movePips, imp.rangeX, imp.price, new Date(imp.t)],
    );
    if (!row) continue;
    alerts++;
    const d = digitsOf(pair, imp.price);
    const head = imp.side === "BUY" ? "🟢 BUY tomonga" : "🔴 SELL tomonga";
    await notifyAdmin([
      `⚡ <b>IMPULS ${pair}</b>: ${head}`,
      `${imp.bars} daqiqada <b>${imp.side === "BUY" ? "+" : "−"}${imp.movePips.toFixed(0)} pips</b> (${imp.from.toFixed(d)} → ${imp.to.toFixed(d)}), shamlar odatdagidan ${imp.rangeX.toFixed(1)}x katta`,
      `Yangilik: ${names}`,
      "Bu tahlil emas, narx harakati haqida ogohlantirish. Kirishdan oldin qaytishni hisobga oling.",
    ].join("\n")).catch(() => {});
  }
  await ping(group ? `Kuzatilmoqda: ${names}` : "15 daqiqalik natijalar yozildi");
  return { watching: group ? names : null, alerts };
}

export async function impulseBoard() {
  const [rows, [p]] = await Promise.all([
    sql<NewsImpulse>("SELECT * FROM news_impulses ORDER BY at DESC LIMIT 80"),
    sql<{ at: Date; note: string }>("SELECT at, note FROM news_watch_pings WHERE id = 1"),
  ]);
  return { rows, ping: p ?? null };
}
