import "server-only";
import { parseDecision, trackPlan, validatePlan, type AiPlan } from "../aiTrade.ts";
import { analyze } from "../engine.ts";
import { ALL_INSTRUMENTS } from "../instruments.ts";
import { getCandles } from "../market.ts";
import type { Candle } from "../types.ts";
import { sql } from "./db.ts";
import { complete, provider } from "./llm.ts";
import { notifyAdmin } from "./telegram.ts";

// AI treyder (faqat demo): har soatda oltin bozorini o'zi tahlil qilib BUY, SELL yoki WAIT qaror qiladi.
// Qarorlar mijozlarga chiqmaydi: faqat admin panelda va adminga Telegram orqali, natijasi R da o'lchanadi.
// O'chirish: AI_TRADER=0. Oraliq: AI_TRADER_EVERY_MIN (standart 60). Model: AI_TRADER_MODEL.

const PAIR = "XAU/USD";
const gold = () => ALL_INSTRUMENTS.find((i) => i.pair === PAIR)!;

export type AiTrade = {
  id: number; at: Date; pair: string; action: string; status: string; entry: number | null; sl: number | null; tp1: number | null; tp2: number | null;
  confidence: number; reason: string; note: string; model: string; tp1_hit: boolean; result_r: number | null; closed_at: Date | null;
};

export const aiTraderEnabled = () => process.env.AI_TRADER !== "0" && !!provider();

function traderModel() {
  if (process.env.AI_TRADER_MODEL) return process.env.AI_TRADER_MODEL;
  return provider() === "anthropic" ? "claude-opus-5-5" : undefined;
}

const SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["BUY", "SELL", "WAIT"] },
    sl: { type: "number" }, tp1: { type: "number" }, tp2: { type: "number" },
    confidence: { type: "integer" },
    reason: { type: "string" },
  },
  required: ["action", "sl", "tp1", "tp2", "confidence", "reason"],
  additionalProperties: false,
};

const SYSTEM = `Sen Signal Desk'ning AI treyderisan va oltin (XAU/USD) bilan demo hisobda savdo qilasan. Natijang haqqoniy o'lchanadi va robot (Zeus) bilan solishtiriladi.
Har soatda bitta qaror: BUY, SELL yoki WAIT. Kirish doim joriy narxda (bozor buyrug'i).
Qanday tahlil qilasan:
- Yuqoridan pastga: D1 va H4 trendi, keyin H1 tuzilmasi (yuqori/past cho'qqilar), keyin M15 da kirish nuqtasi.
- Talab/taklif zonalari, likvidlik (oldingi cho'qqi va tublar), EMA20/EMA50, RSI, ADX va ATR ni hisobga ol.
- Narx qayerdan tushishi va qayerdan ko'tarilishi mumkinligini aniq darajalar bilan ayt.
Qoidalar:
- Faqat berilgan shamlar va ko'rsatkichlarga tayan. Daraja o'ylab topma, har bir daraja ma'lumotdagi narxga asoslansin.
- SL mantiqiy darajaning orqasida bo'lsin, masofasi H1 ATR ning 0.3-3 baravari. TP1 kamida 0.5R, TP2 kamida 1R va TP1 dan uzoqroq.
- Aniq ustunlik bo'lmasa WAIT de. Yomon savdodan WAIT yaxshi. Oldingi savdolaringning natijasidan saboq ol.
- WAIT bo'lsa sl, tp1, tp2 ni 0 qilib qo'y.
- confidence 0-100. reason o'zbek tilida (lotin), 4-8 jumla: trend, muhim darajalar, kirish sababi va qaysi holatda g'oya bekor bo'lishi.
Javob faqat JSON: {"action","sl","tp1","tp2","confidence","reason"}.`;

const round = (x: number) => Math.round(x * 100) / 100;
const ohlc = (cs: Candle[]) => cs.map((c) => [new Date(c.t).toISOString().slice(5, 16), round(c.o), round(c.h), round(c.l), round(c.c)]);
function ind(cs: Candle[]) {
  const a = analyze(cs.slice(-200));
  return a && { trend: a.trend, ema20: round(a.ema20), ema50: round(a.ema50), rsi: Math.round(a.rsi), adx: Math.round(a.adx), atr: round(a.atr) };
}

async function facts() {
  const inst = gold();
  const [m15, h1, h4] = await Promise.all([getCandles(inst, 15, 260), getCandles(inst, 60, 260), getCandles(inst, 240, 260)]);
  const [states, ctx, past] = await Promise.all([
    sql<{ timeframe: string; side: string | null; quality: string | null; reason: string }>("SELECT timeframe, side, quality, reason FROM robot_state WHERE pair = $1", [PAIR]),
    sql<{ timeframe: string; trend: string }>("SELECT timeframe, trend FROM market_context WHERE pair = $1", [PAIR]),
    sql<AiTrade>("SELECT * FROM ai_trades WHERE pair = $1 AND action <> 'WAIT' ORDER BY at DESC LIMIT 8", [PAIR]),
  ]);
  const h1a = analyze(h1.slice(-200));
  return {
    price: m15.at(-1)?.c ?? 0,
    lastTime: m15.at(-1)?.t ?? 0,
    atrH1: h1a?.atr ?? 0,
    data: {
      juftlik: PAIR, hozir_utc: new Date().toISOString(), joriy_narx: round(m15.at(-1)?.c ?? 0),
      katta_trend: Object.fromEntries(ctx.map((c) => [c.timeframe, c.trend])),
      ko_rsatkichlar: { M15: ind(m15), H1: ind(h1), H4: ind(h4) },
      shamlar_ustunlari: "vaqt_utc, open, high, low, close",
      H4_shamlar: ohlc(h4.slice(-40)),
      H1_shamlar: ohlc(h1.slice(-72)),
      M15_shamlar: ohlc(m15.slice(-64)),
      robot_zeus_fikri: states.map((s) => ({ tf: s.timeframe, yonalish: s.side, sifat: s.quality, sabab: s.reason })),
      oldingi_savdolaring: past.map((t) => ({ vaqt: t.at, yonalish: t.action, kirish: t.entry, sl: t.sl, tp1: t.tp1, tp2: t.tp2, holat: t.status, natija_R: t.result_r })),
    },
  };
}

const planOf = (t: AiTrade): AiPlan => ({ side: t.action as "BUY" | "SELL", entry: Number(t.entry), sl: Number(t.sl), tp1: Number(t.tp1), tp2: Number(t.tp2) });

const STATUS_TEXT: Record<string, string> = { sl: "SL urildi", be: "TP1 dan keyin kirishda yopildi", tp2: "TP2 urildi", expired: "24 soat o'tib yopildi" };

// Ochiq AI savdolarini M5 shamlari bo'yicha yangilaydi (har 5 daqiqada, Twelve Data keshidan, qo'shimcha so'rovsiz).
export async function trackAiTrades() {
  const open = await sql<AiTrade>("SELECT * FROM ai_trades WHERE status IN ('open', 'tp1') ORDER BY at");
  if (!open.length) return;
  const m5 = await getCandles(gold(), 5, 600);
  for (const t of open) {
    const o = trackPlan(planOf(t), new Date(t.at).getTime(), m5);
    if (o.status === t.status && o.tp1Hit === t.tp1_hit) continue;
    const closed = o.resultR != null;
    await sql(
      `UPDATE ai_trades SET status = $2, tp1_hit = $3, result_r = $4, closed_at = $5, updated_at = now() WHERE id = $1`,
      [t.id, o.status, o.tp1Hit, o.resultR, closed && o.at ? new Date(o.at + 5 * 60_000) : null],
    );
    if (closed) await notifyAdmin(`🤖 AI ${t.action} ${PAIR} yopildi: ${STATUS_TEXT[o.status] ?? o.status}, natija ${o.resultR! >= 0 ? "+" : ""}${o.resultR!.toFixed(2)}R`);
    else if (o.tp1Hit && !t.tp1_hit) await notifyAdmin(`🤖 AI ${t.action} ${PAIR}: TP1 urildi, SL kirishga ko'chdi`);
  }
}

// Bitta qaror: ochiq savdo bo'lsa yoki bozor yopiq bo'lsa so'ralmaydi. force: admin "Hozir so'rash" tugmasi.
export async function aiDecide(force = false): Promise<{ trade?: AiTrade; skipped?: string }> {
  if (!aiTraderEnabled()) return { skipped: "AI ulanmagan" };
  const [busy] = await sql<{ n: string }>("SELECT count(*) AS n FROM ai_trades WHERE status IN ('open', 'tp1')");
  if (Number(busy.n) > 0) return { skipped: "Ochiq AI savdo bor" };
  if (!force) {
    const every = Math.max(15, Number(process.env.AI_TRADER_EVERY_MIN ?? 60));
    const [last] = await sql<{ at: Date }>("SELECT at FROM ai_trades ORDER BY at DESC LIMIT 1");
    if (last && Date.now() - new Date(last.at).getTime() < (every - 2) * 60_000) return { skipped: "Hali vaqti emas" };
  }
  const f = await facts();
  if (!f.price || Date.now() - f.lastTime > 45 * 60_000) return { skipped: "Bozor yopiq" };

  const model = traderModel();
  const text = await complete(SYSTEM, [{ role: "user", content: JSON.stringify(f.data) }], {
    json: SCHEMA, model, maxTokens: provider() === "anthropic" ? 8000 : 2000,
  });
  const d = parseDecision(text);
  const modelName = model ?? process.env.LLM_MODEL ?? provider() ?? "";
  if (!d) {
    const [row] = await sql<AiTrade>(
      "INSERT INTO ai_trades (pair, action, status, note, model) VALUES ($1, 'WAIT', 'rejected', $2, $3) RETURNING *",
      [PAIR, `Javob o'qilmadi: ${text.slice(0, 300)}`, modelName],
    );
    return { trade: row };
  }
  const v = validatePlan(d, f.price, f.atrH1);
  const p = v.plan;
  const status = p ? "open" : d.action === "WAIT" ? "wait" : "rejected";
  const [row] = await sql<AiTrade>(
    `INSERT INTO ai_trades (pair, action, status, entry, sl, tp1, tp2, confidence, reason, note, model)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [PAIR, d.action, status, f.price, p?.sl ?? d.sl ?? null, p?.tp1 ?? d.tp1 ?? null, p?.tp2 ?? d.tp2 ?? null,
      d.confidence ?? 0, d.reason ?? "", status === "rejected" ? `Tekshiruvdan o'tmadi: ${v.error}` : "", modelName],
  );
  if (p) {
    await notifyAdmin(`🤖 AI treyder (demo): ${p.side} ${PAIR}\nKirish ${round(p.entry)}, SL ${p.sl}, TP1 ${p.tp1}, TP2 ${p.tp2}, ishonch ${d.confidence}%\n${d.reason ?? ""}`);
  }
  return { trade: row };
}

export type AiStats = { trades: number; closed: number; wins: number; totalR: number; avgR: number; waits: number };

export async function aiSummary(days = 30) {
  const rows = await sql<AiTrade>("SELECT * FROM ai_trades WHERE at > now() - make_interval(days => $1) ORDER BY at DESC", [days]);
  const trades = rows.filter((r) => r.status !== "wait" && r.status !== "rejected");
  const closed = trades.filter((r) => r.result_r != null);
  const totalR = closed.reduce((a, r) => a + Number(r.result_r), 0);
  const ai: AiStats = {
    trades: trades.length, closed: closed.length, wins: closed.filter((r) => Number(r.result_r) > 0).length,
    totalR, avgR: closed.length ? totalR / closed.length : 0, waits: rows.filter((r) => r.status === "wait").length,
  };
  const [z] = await sql<{ n: string; wins: string; total: number | null }>(
    `SELECT count(*) AS n, count(*) FILTER (WHERE result_r > 0) AS wins, sum(result_r) AS total FROM signal_log
     WHERE pair = $1 AND status <> 'active' AND result_r IS NOT NULL AND signal_time > now() - make_interval(days => $2)`,
    [PAIR, days],
  );
  const zn = Number(z.n), zt = Number(z.total ?? 0);
  const zeus = { closed: zn, wins: Number(z.wins), totalR: zt, avgR: zn ? zt / zn : 0 };
  return { rows, ai, zeus };
}
