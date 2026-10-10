import "server-only";
import { pipSize } from "../aiTrade.ts";
import { ALL_INSTRUMENTS } from "../instruments.ts";
import { getCandles, getM1 } from "../market.ts";
import { describe, getCalendar, type NewsEvent } from "../news.ts";
import { checkInvalidation, groupByTime, newsOutcome, parseNewsCall, reactionStats, type NewsStats } from "../newsReaction.ts";
import { digitsOf } from "./analysis.ts";
import { ind, ohlc, round, traderModel } from "./aiTrader.ts";
import { sql } from "./db.ts";
import { complete, provider } from "./llm.ts";
import { notifyAdmin } from "./telegram.ts";

// Yangilik reaksiyasi (egasining talabi, 2026-10-10): kuchli (High) yangilik chiqqach, NEWS_WAIT_MIN (standart 3) daqiqadan keyin
// Claude M1 reaksiyasini ko'rib savdo yo'nalishi, taxminiy pips maqsadi va bekor bo'lish narxini aytadi.
// Natija admin "Yangiliklar M1" sahifasida va Telegram'da, keyin har 5 daqiqada M1 bo'yicha o'lchanadi (maqsad, bekor yoki muddat).
// Savdo ochilmaydi, mijozlarga chiqmaydi. Juftliklar: NEWS_PAIRS (standart XAU/USD), o'chirish: NEWS_AI=0.
// Model: juftlik treyderi bilan bir xil (oltinda Opus). Haftasiga bir necha chaqiruv, kunlik chegaraga sanaladi lekin to'xtatilmaydi.

export const newsEnabled = () => process.env.NEWS_AI !== "0" && !!provider();
export const newsPairs = () => (process.env.NEWS_PAIRS ?? "XAU/USD").split(",").map((s) => s.trim()).filter((p) => ALL_INSTRUMENTS.some((i) => i.pair === p));
const waitMin = () => Math.max(1, Number(process.env.NEWS_WAIT_MIN ?? 3));
const WINDOW_MIN = 30; // chiqqandan keyin shu vaqtgacha avtomatik tahlil qilinadi

export type NewsReaction = {
  id: number; at: Date; event_time: Date; pair: string; events: { title: string; uz: string | null; forecast: string; previous: string; currency: string }[];
  stats: NewsStats | null; price: number | null; direction: string; confidence: number; target_pips: number | null; invalidation: number | null;
  horizon_min: number; entry_note: string; reason: string; model: string; status: string; result_pips: number | null;
  mfe_pips: number | null; mae_pips: number | null; closed_at: Date | null;
};

const SCHEMA = {
  type: "object",
  properties: {
    direction: { type: "string", enum: ["BUY", "SELL", "WAIT"] },
    confidence: { type: "integer" },
    target_pips: { type: "number" },
    invalidation: { type: "number" },
    horizon_min: { type: "integer" },
    entry: { type: "string" },
    reason: { type: "string" },
  },
  required: ["direction", "confidence", "target_pips", "invalidation", "horizon_min", "entry", "reason"],
  additionalProperties: false,
};

const systemFor = (pair: string) => `Sen Zeus Number One'ning yangiliklar bo'yicha treyderisan. Kuchli iqtisodiy yangilik (masalan NFP, CPI, FOMC) hozirgina chiqdi.
Vazifang: ${pair} ning M1 reaksiyasini tezda tahlil qilib, keyingi 15-120 daqiqadagi savdo oqimini aytish: BUY, SELL yoki WAIT,
taxminiy pips maqsadi va g'oya bekor bo'ladigan narx.
Pips: ${pair === "XAU/USD" ? "oltinda 1 pip = 0.10 $ (10 $ harakat = 100 pips)" : `1 pip = ${pipSize(pair)}`}.
Qanday tahlil qilasan:
- Yangilikning haqiqiy qiymati berilmagan: uni narx reaksiyasidan bilasan (prognoz va oldingi qiymat bor). USD uchun kuchli ma'lumot odatda
  dollarni ko'taradi va oltinni tushiradi, kuchsiz ma'lumot aksincha.
- Birinchi daqiqa sakrashi ko'pincha qisman qaytadi. Harakat davom etyaptimi (yangi cho'qqi/tub, shamlar tanasi katta, qaytish sayoz)
  yoki so'nyaptimi (uzun soyalar, narx chiqishdan oldingi diapazonga qaytdi) ni M1 shamlaridan aniqla.
- Chiqishdan oldingi H1/M15 trendi, muhim darajalar va likvidlik (oldingi cho'qqi va tublar) ni hisobga ol: maqsad ana shu darajalarga qarab.
- Hozir kirsa (joriy narxda) qayerga borishi mumkin: target_pips joriy narxdan hisoblanadi, realistik bo'lsin (yangilik harakati va ATR ga qarab).
Qoidalar:
- Faqat berilgan shamlar va ko'rsatkichlarga tayan, daraja o'ylab topma.
- invalidation: shu narxga yetsa g'oya bekor (BUY uchun joriy narxdan past, SELL uchun yuqori), mantiqiy daraja ortida.
- Reaksiya aralash yoki harakat allaqachon tugagan bo'lsa WAIT de, target_pips va invalidation ni 0 qil.
- horizon_min: maqsadga necha daqiqada yetishi mumkin (15-120).
- entry: qisqa kirish g'oyasi (masalan "joriy narxda" yoki "2650 gacha qaytishda").
- confidence 0-100. reason o'zbek tilida (lotin), 3-6 jumla: reaksiya qanday bo'ldi, ma'lumot kuchli yoki kuchsiz chiqqani, nega shu yo'nalish va maqsad.
Javob faqat JSON: {"direction","confidence","target_pips","invalidation","horizon_min","entry","reason"}.`;

const evOf = (e: NewsEvent) => ({ title: e.title, uz: describe(e.title), forecast: e.forecast, previous: e.previous, currency: e.currency });

// Cron: yangi chiqqan kuchli yangiliklarni tahlil qiladi va ochiq natijalarni o'lchaydi.
export async function newsCycle(): Promise<NewsReaction[]> {
  if (!newsEnabled()) return [];
  await trackNewsReactions().catch((e) => console.error("Yangilik kuzatuvi", e));
  // To'xtab qolgan (javob kelmagan) yozuv keyingi aylanishda qayta uriniladi.
  await sql("DELETE FROM news_reactions WHERE status = 'pending' AND at < now() - interval '4 minutes'");
  const now = Date.now();
  const events = (await getCalendar()).filter((e) => e.impact === "High" && e.time + waitMin() * 60_000 <= now && now <= e.time + WINDOW_MIN * 60_000);
  const out: NewsReaction[] = [];
  for (const g of groupByTime(events)) {
    for (const pair of newsPairs().filter((p) => g.events.some((e) => e.pairs.includes(p)))) {
      const r = await analyzeRelease(pair, g.time, g.events.filter((e) => e.pairs.includes(pair))).catch((e) => {
        console.error("Yangilik tahlili", pair, e);
        return null;
      });
      if (r) out.push(r);
    }
  }
  return out;
}

// Admin tugmasi: oxirgi 3 soatda chiqqan eng so'nggi kuchli yangilikni (hali tahlil qilinmagan bo'lsa) hozir tahlil qiladi.
export async function newsNow(): Promise<string> {
  if (!provider()) return "AI ulanmagan";
  const now = Date.now();
  const events = (await getCalendar()).filter((e) => e.impact === "High" && e.time + 60_000 <= now && now <= e.time + 3 * 3600_000);
  const g = groupByTime(events).at(-1);
  if (!g) return "Oxirgi 3 soatda kuchli yangilik chiqmagan";
  const msgs: string[] = [];
  for (const pair of newsPairs().filter((p) => g.events.some((e) => e.pairs.includes(p)))) {
    const r = await analyzeRelease(pair, g.time, g.events.filter((e) => e.pairs.includes(pair)));
    msgs.push(r ? `${pair}: ${r.direction}${r.target_pips ? ` ~${r.target_pips} pips` : ""}` : `${pair}: allaqachon tahlil qilingan yoki M1 ma'lumoti hali yo'q`);
  }
  return msgs.join("; ") || "Bu yangilik kuzatiladigan juftliklarga ta'sir qilmaydi";
}

async function analyzeRelease(pair: string, time: number, events: NewsEvent[]): Promise<NewsReaction | null> {
  const [done] = await sql<{ id: number }>("SELECT id FROM news_reactions WHERE event_time = $1 AND pair = $2", [new Date(time), pair]);
  if (done) return null;
  const inst = ALL_INSTRUMENTS.find((i) => i.pair === pair)!;
  const sinceMin = Math.ceil((Date.now() - time) / 60_000);
  const m1 = await getM1(inst, Math.min(400, sinceMin + 60));
  // Ma'lumot manbasi kechiksa (chiqqandan keyingi shamlar hali yo'q) keyingi aylanishda qayta uriniladi.
  if ((m1.at(-1)?.t ?? 0) < time + 60_000) return null;
  const stats = reactionStats(pair, m1, time);
  if (!stats) return null;

  // Bir vaqtda ikki cron yoki tugma bo'lsa faqat bittasi tahlil qiladi.
  const [claim] = await sql<{ id: number }>(
    `INSERT INTO news_reactions (event_time, pair, events, stats, price, status) VALUES ($1, $2, $3, $4, $5, 'pending')
     ON CONFLICT (event_time, pair) DO NOTHING RETURNING id`,
    [new Date(time), pair, JSON.stringify(events.map(evOf)), JSON.stringify(stats), stats.price],
  );
  if (!claim) return null;

  const [m15, h1] = await Promise.all([getCandles(inst, 15, 260), getCandles(inst, 60, 260)]).catch(() => [[], []]);
  const d = digitsOf(pair, stats.price);
  const data = {
    juftlik: pair, hozir_utc: new Date().toISOString(), yangilik_chiqqan_utc: new Date(time).toISOString(),
    yangiliklar: events.map((e) => ({ nomi: e.title, izoh: describe(e.title), valyuta: e.currency, prognoz: e.forecast || null, oldingi: e.previous || null })),
    joriy_narx: round(stats.price, d),
    reaksiya_pips: {
      chiqishdan_oldingi_narx: round(stats.base, d), birinchi_daqiqa: stats.firstMinPips, jami_harakat: stats.movePips,
      eng_yuqori: stats.upPips, eng_past: -stats.downPips, chiqishdan_oldingi_30_daqiqa_diapazoni: stats.preRangePips, otgan_daqiqa: stats.minutes,
    },
    ko_rsatkichlar_chiqishdan_oldin: { M15: m15.length ? ind(m15.filter((c) => c.t + 15 * 60_000 <= time), d) : null, H1: h1.length ? ind(h1.filter((c) => c.t + 3600_000 <= time), d) : null },
    shamlar_ustunlari: "vaqt_utc, open, high, low, close",
    H1_shamlar: ohlc(h1.slice(-24), d),
    M15_shamlar: ohlc(m15.slice(-24), d),
    M1_shamlar: ohlc(m1.filter((c) => c.t >= time - 30 * 60_000), d),
  };
  const model = traderModel(pair);
  const modelName = model ?? process.env.LLM_MODEL ?? provider() ?? "";
  let text: string;
  try {
    text = await complete(systemFor(pair), [{ role: "user", content: JSON.stringify(data) }], { json: SCHEMA, model, maxTokens: 1500 });
  } catch (e) {
    await sql("DELETE FROM news_reactions WHERE id = $1", [claim.id]);
    throw e;
  }
  const v = parseNewsCall(text);
  const inv = v ? checkInvalidation(v, stats.price) : null;
  const status = !v ? "error" : v.direction === "WAIT" ? "wait" : "open";
  const [row] = await sql<NewsReaction>(
    `UPDATE news_reactions SET at = now(), direction = $2, confidence = $3, target_pips = $4, invalidation = $5, horizon_min = $6,
       entry_note = $7, reason = $8, model = $9, status = $10 WHERE id = $1 RETURNING *`,
    [claim.id, v?.direction ?? "WAIT", v?.confidence ?? 0, v?.targetPips || null, inv, v?.horizonMin ?? 60, v?.entry ?? "",
      v?.reason ?? `Javob o'qilmadi: ${text.slice(0, 200)}`, modelName, status],
  );
  await notifyAdmin(newsMessage(row, d)).catch(() => {});
  return row;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const sgn = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(0)}`;

function newsMessage(r: NewsReaction, d: number): string {
  const names = r.events.map((e) => e.uz ?? e.title).join(", ");
  const s = r.stats;
  const head = r.direction === "BUY" ? "🟢 BUY" : r.direction === "SELL" ? "🔴 SELL" : "⏸ WAIT";
  return [
    `📰 <b>${esc(names)}</b> · ${esc(r.pair)} (M1)`,
    r.direction === "WAIT" ? `<b>${head}</b>: aniq yo'nalish yo'q` : `<b>${head}</b> · taxminan <b>${r.target_pips ?? 0} pips</b> · ishonch ${r.confidence}%`,
    s ? `Narx <code>${Number(r.price).toFixed(d)}</code>, 1-daqiqa ${sgn(s.firstMinPips)} pips, ${s.minutes} daqiqada ${sgn(s.movePips)} pips` : "",
    r.invalidation ? `Bekor: <code>${Number(r.invalidation).toFixed(d)}</code> · muddat ${r.horizon_min} daq` : "",
    r.entry_note ? `Kirish: ${esc(r.entry_note)}` : "",
    "", esc(r.reason),
  ].filter((x, i) => x || i === 5).join("\n");
}

// Ochiq yangilik qarorlari natijasi M1 bo'yicha: maqsad, bekor narxi yoki muddat oxiri.
export async function trackNewsReactions() {
  const open = await sql<NewsReaction>("SELECT * FROM news_reactions WHERE status = 'open' ORDER BY at");
  const byPair = new Map<string, NewsReaction[]>();
  for (const r of open) byPair.set(r.pair, [...(byPair.get(r.pair) ?? []), r]);
  for (const [pair, rows] of byPair) {
    const inst = ALL_INSTRUMENTS.find((i) => i.pair === pair);
    if (!inst) continue;
    const oldest = Math.min(...rows.map((r) => new Date(r.at).getTime()));
    const m1 = await getM1(inst, Math.min(400, Math.ceil((Date.now() - oldest) / 60_000) + 5));
    for (const r of rows) {
      const at = new Date(r.at).getTime();
      const o = newsOutcome(pair, r.direction as "BUY" | "SELL", Number(r.price), Number(r.target_pips ?? 0), r.invalidation == null ? null : Number(r.invalidation), m1, Math.ceil(at / 60_000) * 60_000, r.horizon_min, 60_000);
      // M1 tarixi yetmasa (juda eski yozuv) muddati o'tgan deb yopiladi.
      const stale = o.status === "open" && Date.now() > at + (r.horizon_min + 360) * 60_000;
      await sql(
        `UPDATE news_reactions SET status = $2, result_pips = $3, mfe_pips = $4, mae_pips = $5, closed_at = CASE WHEN $2 <> 'open' THEN now() END WHERE id = $1`,
        [r.id, stale ? "expired" : o.status, o.resultPips, o.mfePips, o.maePips],
      );
      if (o.status !== "open") {
        const icon = o.status === "target" ? "✅" : o.status === "stop" ? "❌" : "⏹";
        await notifyAdmin(`${icon} Yangilik qarori ${r.direction} ${pair}: ${o.status === "target" ? "maqsad urildi" : o.status === "stop" ? "bekor narxi urildi" : "muddat tugadi"}, ${sgn(o.resultPips ?? 0)} pips (eng yaxshi +${o.mfePips.toFixed(0)})`).catch(() => {});
      }
    }
  }
}

export async function newsBoard(days = 30) {
  const [rows, [stats]] = await Promise.all([
    sql<NewsReaction>("SELECT * FROM news_reactions WHERE status <> 'pending' ORDER BY event_time DESC, pair LIMIT 60"),
    sql<{ calls: string; closed: string; wins: string; pips: string | null }>(
      `SELECT count(*) FILTER (WHERE direction <> 'WAIT') AS calls,
              count(*) FILTER (WHERE status IN ('target', 'stop', 'expired')) AS closed,
              count(*) FILTER (WHERE status IN ('target', 'stop', 'expired') AND result_pips > 0) AS wins,
              sum(result_pips) FILTER (WHERE status IN ('target', 'stop', 'expired')) AS pips
       FROM news_reactions WHERE at > now() - make_interval(days => $1)`,
      [days],
    ),
  ]);
  return { rows, stats: { calls: Number(stats?.calls ?? 0), closed: Number(stats?.closed ?? 0), wins: Number(stats?.wins ?? 0), pips: Number(stats?.pips ?? 0) } };
}
