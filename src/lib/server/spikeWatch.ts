import "server-only";
import { ALL_INSTRUMENTS } from "../instruments.ts";
import { getM1 } from "../market.ts";
import { describe, getCalendar } from "../news.ts";
import { marketOpen } from "../sessions.ts";
import { detectSpike, followSpike } from "../spike.ts";
import type { Candle, Instrument } from "../types.ts";
import { ohlc } from "./aiTrader.ts";
import { digitsOf } from "./analysis.ts";
import { sql } from "./db.ts";
import { complete, provider } from "./llm.ts";
import { notifyAdmin } from "./telegram.ts";

// Keskin harakat kuzatuvi (egasining talabi, 2026-10-10): har daqiqada (/api/news-watch bilan birga) oltin M1 tekshiriladi,
// yangilikdan qat'i nazar 2-3 daqiqada SPIKE_PIPS (standart 180 = 18 $) va undan ko'p harakat bo'lsa: darhol Telegram,
// bazaga (price_spikes) yoziladi, keyin 60 daqiqa davomida qancha yurgani (shu tomonga eng uzoq, teskari, 5/15/30/60 daqiqada) o'lchanadi.
// 60 daqiqadan keyin Claude qisqa xulosa yozadi (cron'da, SPIKE_MODEL, standart Sonnet).
// Manba: SPIKE_SOURCE=paxg (standart: Binance PAXGUSDT, real vaqt, limitsiz; Twelve Data kunlik 800 so'rovga har daqiqa sig'maydi)
// yoki twelvedata. O'chirish: SPIKE_WATCH=0.

export const spikeEnabled = () => process.env.SPIKE_WATCH !== "0";
export const spikePips = () => Math.max(20, Number(process.env.SPIKE_PIPS ?? 180));
const PAIR = "XAU/USD";
const COOLDOWN_MIN = 5;
const FOLLOW_MIN = 60;

export function spikeSource(): { inst: Instrument; label: string } {
  const gold = ALL_INSTRUMENTS.find((i) => i.pair === PAIR)!;
  if (process.env.SPIKE_SOURCE === "twelvedata" && gold.source === "twelvedata") return { inst: gold, label: "Twelve Data XAU/USD" };
  return { inst: { pair: PAIR, category: "gold", source: "binance", symbol: "PAXGUSDT" }, label: "Binance PAXG/USDT (oltin tokeni)" };
}

export type PriceSpike = {
  id: number; at: Date; pair: string; source: string; side: string; bars: number; move_pips: number; peak_pips: number;
  from_price: number; price: number; candle_time: Date; news: string; status: string; minutes: number;
  mfe_pips: number | null; mae_pips: number | null; after5: number | null; after15: number | null; after30: number | null; after60: number | null;
  note: string; note_at: Date | null;
};

const sgn = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(0)}`;

// Har daqiqada: yangi keskin harakatni topish va kuzatilayotganlarini yangilash.
export async function spikeWatch(lookback = 1): Promise<{ spikes: number; tracking: number }> {
  if (!spikeEnabled()) return { spikes: 0, tracking: 0 };
  const tracking = await sql<PriceSpike>("SELECT * FROM price_spikes WHERE status = 'tracking' ORDER BY candle_time");
  if (!marketOpen("gold") && !tracking.length) return { spikes: 0, tracking: 0 };
  const { inst, label } = spikeSource();
  const m1 = await getM1(inst, 90);
  if (!m1.length) return { spikes: 0, tracking: tracking.length };
  const d = digitsOf(PAIR, m1.at(-1)!.c);

  // Kuzatilayotganlar: qancha yurdi.
  for (const s of tracking) {
    const t = new Date(s.candle_time).getTime();
    const f = followSpike(PAIR, s.side as "BUY" | "SELL", Number(s.price), t, m1);
    const done = Date.now() >= t + (FOLLOW_MIN + 1) * 60_000 + 60_000;
    await sql(
      "UPDATE price_spikes SET minutes = $2, mfe_pips = $3, mae_pips = $4, after5 = $5, after15 = $6, after30 = $7, after60 = $8 WHERE id = $1",
      [s.id, f.minutes, f.mfePips, f.maePips, f.after5, f.after15, f.after30, f.after60],
    );
    // Ikki chaqiruv bir vaqtda bo'lsa natija xabari bir marta.
    const closed = done ? await sql("UPDATE price_spikes SET status = 'done' WHERE id = $1 AND status = 'tracking' RETURNING id", [s.id]) : [];
    if (closed.length) {
      await notifyAdmin(`📊 Keskin harakat natijasi (${s.side} ${PAIR}, ${sgn(s.side === "BUY" ? s.move_pips : -s.move_pips)} pips): keyingi 60 daqiqada `
        + `shu tomonga yana +${f.mfePips.toFixed(0)} pips, teskari −${f.maePips.toFixed(0)} pips, 60 daqiqada ${f.after60 != null ? sgn(f.after60) : "—"} pips`).catch(() => {});
    }
  }

  // Yangi harakat.
  if (!marketOpen("gold")) return { spikes: 0, tracking: tracking.length };
  const sp = detectSpike(PAIR, m1, spikePips(), lookback);
  if (!sp) return { spikes: 0, tracking: tracking.length };
  const [recent] = await sql<{ id: number }>(
    "SELECT id FROM price_spikes WHERE side = $1 AND candle_time > $2", [sp.side, new Date(sp.t - COOLDOWN_MIN * 60_000)],
  );
  if (recent) return { spikes: 0, tracking: tracking.length };
  const news = await nearbyNews(sp.t).catch(() => "");
  const [row] = await sql<PriceSpike>(
    `INSERT INTO price_spikes (pair, source, side, bars, move_pips, peak_pips, from_price, price, candle_time, news)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (pair, candle_time) DO NOTHING RETURNING *`,
    [PAIR, label, sp.side, sp.bars, sp.movePips, sp.peakPips, sp.from, sp.price, new Date(sp.t), news],
  );
  if (!row) return { spikes: 0, tracking: tracking.length };
  await notifyAdmin([
    `🚨 <b>KESKIN HARAKAT ${PAIR}</b>: ${sp.side === "BUY" ? "🟢 yuqoriga" : "🔴 pastga"}`,
    `${sp.bars} daqiqada <b>${sgn(sp.side === "BUY" ? sp.movePips : -sp.movePips)} pips</b> (${sp.from.toFixed(d)} → ${sp.price.toFixed(d)}), eng chekka ${sp.peakPips.toFixed(0)} pips`,
    news ? `Yaqin yangilik: ${news}` : "Kalendarda yaqin yangilik yo'q",
    "Keyingi 60 daqiqada qancha yurishi yozib boriladi.",
  ].join("\n")).catch(() => {});
  return { spikes: 1, tracking: tracking.length + 1 };
}

// Harakatdan ±20 daqiqa ichidagi kalendar yangiliklari.
async function nearbyNews(t: number): Promise<string> {
  const cal = await getCalendar();
  return cal.filter((e) => Math.abs(e.time - t) <= 20 * 60_000 && e.currency === "USD")
    .map((e) => `${describe(e.title) ?? e.title} (${e.impact})`).join(", ");
}

// Cron: kuzatuvi tugagan harakatlarga Claude qisqa xulosa yozadi (nima bo'ldi, qancha yurdi, nimani o'rganish mumkin).
export async function spikeNotes(max = 2) {
  if (!spikeEnabled() || !provider()) return;
  const rows = await sql<PriceSpike>("SELECT * FROM price_spikes WHERE status = 'done' AND note_at IS NULL ORDER BY candle_time LIMIT $1", [max]);
  for (const s of rows) {
    await sql("UPDATE price_spikes SET note_at = now() WHERE id = $1", [s.id]);
    const { inst } = spikeSource();
    const t = new Date(s.candle_time).getTime();
    const m1: Candle[] = await getM1(inst, Math.min(400, Math.ceil((Date.now() - t) / 60_000) + 30)).catch(() => []);
    const d = digitsOf(PAIR, Number(s.price));
    const data = {
      juftlik: PAIR, manba: s.source, yonalish: s.side, daqiqalar: s.bars, harakat_pips: s.move_pips, eng_chekka_pips: s.peak_pips,
      boshlanish_narxi: s.from_price, harakat_oxiri_narxi: s.price, vaqt_utc: new Date(t).toISOString(), yaqin_yangilik: s.news || null,
      keyingi_60_daqiqa_pips: { shu_tomonga_eng_uzoq: s.mfe_pips, teskari_eng_uzoq: s.mae_pips, "5_daqiqada": s.after5, "15_daqiqada": s.after15, "30_daqiqada": s.after30, "60_daqiqada": s.after60 },
      shamlar_ustunlari: "vaqt_utc, open, high, low, close",
      M1_shamlar: ohlc(m1.filter((c) => c.t >= t - 20 * 60_000 && c.t <= t + 61 * 60_000), d),
    };
    const model = process.env.SPIKE_MODEL || (provider() === "anthropic" ? "claude-sonnet-5-5" : undefined);
    const note = await complete(
      `Sen oltin treyderisan. Oltinda M1 da keskin harakat bo'ldi va keyingi 60 daqiqa yozib olindi. O'zbek tilida (lotin), 3-5 jumla:
harakat qanday bo'ldi (sabab: yangilik yoki likvidlik), keyin narx qancha davom etdi yoki qaytdi (pips bilan), va bunday harakatda
qanday savdo qilish foydali bo'lardi (harakat yo'nalishida kirish yoki qaytishni kutish). Faqat berilgan ma'lumotga tayan. Oltinda 1 pip = 0.10 $.`,
      [{ role: "user", content: JSON.stringify(data) }], { model, maxTokens: 700 },
    ).catch((e) => `Xulosa yozilmadi: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300));
    await sql("UPDATE price_spikes SET note = $2 WHERE id = $1", [s.id, note]);
  }
}

export async function spikeBoard() {
  const [rows, [st]] = await Promise.all([
    sql<PriceSpike>("SELECT * FROM price_spikes ORDER BY candle_time DESC LIMIT 100"),
    sql<{ n: string; cont: string; avg_mfe: number | null; avg60: number | null }>(
      `SELECT count(*) AS n, count(*) FILTER (WHERE after15 > 0) AS cont, avg(mfe_pips) AS avg_mfe, avg(after60) AS avg60
       FROM price_spikes WHERE status = 'done' AND candle_time > now() - interval '30 days'`,
    ),
  ]);
  return { rows, stats: { n: Number(st?.n ?? 0), cont: Number(st?.cont ?? 0), avgMfe: st?.avg_mfe == null ? null : Number(st.avg_mfe), avg60: st?.avg60 == null ? null : Number(st.avg60) } };
}
