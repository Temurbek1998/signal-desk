import "server-only";
import { ANALYSIS_PROMPT, ANALYSIS_SCHEMA, parseAnalysis, type AiAnalysis } from "../aiAnalysis.ts";
import { parseDecision, SWING_LIMITS, trackPlan, validatePlan, type AiPlan, type PlanLimits, type StopMove } from "../aiTrade.ts";
import { analyze } from "../engine.ts";
import { activeInstruments, ALL_INSTRUMENTS } from "../instruments.ts";
import { getCandles, getContextCandles } from "../market.ts";
import { marketOpen } from "../sessions.ts";
import type { Candle } from "../types.ts";
import { digitsOf } from "./analysis.ts";
import { underBudget } from "./aiBudget.ts";
import { sql } from "./db.ts";
import { complete, provider } from "./llm.ts";
import { notifyAdmin } from "./telegram.ts";

// AI treyder (faqat demo): har juftlikda alohida Claude bozorni o'zi tahlil qilib BUY, SELL yoki WAIT qaror qiladi.
// Oltin: har AI_TRADER_EVERY_MIN (standart 60) daqiqada, AI_TRADER_MODEL (Opus). Valyutalar: har AI_FX_TRADER_EVERY_MIN
// (standart 120), AI_FX_TRADER_MODEL (Sonnet). Valyutalarni o'chirish: AI_FX_TRADER=0. Bir cron aylanishida bitta qaror.
// Bir juftlikda bir vaqtda AI_MAX_OPEN (standart 2) tagacha kun ichidagi savdo ochiq bo'lishi mumkin.
// Ochiq savdolarni Claude har soatda qayta ko'radi: aiManager.ts.
// Qarorlar mijozlarga chiqmaydi: faqat admin panelda va adminga Telegram orqali, natijasi R da o'lchanadi.
// O'chirish: AI_TRADER=0. Oraliq: AI_TRADER_EVERY_MIN (standart 60). Model: AI_TRADER_MODEL.
// Har qaror oltin uchun "Robot + Claude" ko'rinishi sifatida ham yoziladi (ai_views), alohida chaqiruv kerak emas.

const PAIR = "XAU/USD";
const gold = () => ALL_INSTRUMENTS.find((i) => i.pair === PAIR)!;

export type AiTrade = {
  id: number; at: Date; pair: string; action: string; status: string; entry: number | null; sl: number | null; tp1: number | null; tp2: number | null;
  confidence: number; reason: string; note: string; model: string; tp1_hit: boolean; result_r: number | null; closed_at: Date | null;
  analysis: AiAnalysis | null; mode: string; stops: StopMove[] | null; exit_price: number | null; reviewed_at: Date | null;
};

export const aiTraderEnabled = () => process.env.AI_TRADER !== "0" && !!provider();

export function traderModel(pair: string) {
  if (pair !== PAIR) return process.env.AI_FX_TRADER_MODEL || (provider() === "anthropic" ? "claude-sonnet-5-5" : undefined);
  if (process.env.AI_TRADER_MODEL) return process.env.AI_TRADER_MODEL;
  return provider() === "anthropic" ? "claude-opus-5-5" : undefined;
}
const everyMin = (pair: string) => Math.max(15, Number((pair === PAIR ? process.env.AI_TRADER_EVERY_MIN : process.env.AI_FX_TRADER_EVERY_MIN) ?? (pair === PAIR ? 60 : 120)));
const maxOpen = () => Math.max(1, Number(process.env.AI_MAX_OPEN ?? 2));
// Claude treyder ishlaydigan juftliklar: oltin va (AI_FX_TRADER=0 bo'lmasa) yoqilgan valyutalar.
export const traderPairs = () => activeInstruments()
  .filter((i) => i.category === "gold" || (i.category === "forex" && process.env.AI_FX_TRADER !== "0"))
  .sort((a, b) => (a.pair === PAIR ? -1 : b.pair === PAIR ? 1 : 0));

// Swing rejimi (demo): Claude 3–5 kunlik savdo, oltinda 700–1000 pips (70–100 $) maqsad. Har juftlikda AI_SWING_EVERY_H
// (standart 24) soatda bir qaror, shu juftlikda ochiq swing savdo bo'lmasa. H1 shamlari bo'yicha kuzatiladi,
// AI_SWING_MAX_H (standart 120) soatda yopiladi. O'chirish: AI_SWING=0.
export const swingEnabled = () => aiTraderEnabled() && process.env.AI_SWING !== "0";
const swingEveryH = () => Math.max(4, Number(process.env.AI_SWING_EVERY_H ?? 24));
export const swingMaxH = () => Math.max(24, Number(process.env.AI_SWING_MAX_H ?? 120));

const SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["BUY", "SELL", "WAIT"] },
    sl: { type: "number" }, tp1: { type: "number" }, tp2: { type: "number" },
    confidence: { type: "integer" },
    reason: { type: "string" },
    agree: { type: "string", enum: ["rozi", "qisman", "qarshi"] },
    analysis: ANALYSIS_SCHEMA,
  },
  required: ["action", "sl", "tp1", "tp2", "confidence", "reason", "agree", "analysis"],
  additionalProperties: false,
};

const systemFor = (pair: string) => `Sen Signal Desk'ning AI treyderisan va ${pair} bilan demo hisobda savdo qilasan. Natijang haqqoniy o'lchanadi va robot (Zeus) bilan solishtiriladi.
Har soatda bitta qaror: BUY, SELL yoki WAIT. Kirish doim joriy narxda (bozor buyrug'i).
Qanday tahlil qilasan:
- Yuqoridan pastga: D1 va H4 trendi, keyin H1 tuzilmasi (yuqori/past cho'qqilar), keyin M15 da kirish nuqtasi.
- Talab/taklif zonalari, likvidlik (oldingi cho'qqi va tublar), EMA20/EMA50, RSI, ADX va ATR ni hisobga ol.
- Narx qayerdan tushishi va qayerdan ko'tarilishi mumkinligini aniq darajalar bilan ayt.
Hamkoring Zeus (qoidaga asoslangan robot) strategiyasi, undan foydalan: EMA20/EMA50 bilan trend yo'nalishi, ADX >= 20 bo'lsa trend bor,
M15 signali H1 trendi bilan tasdiqlanadi, kirish trend ichidagi pullback tugaganda (BUY uchun RSI 45 dan pastga tushib qaytsa, SELL uchun 55 dan),
${pair === PAIR ? "SL 2.5 ATR, TP1 0.5R (yarmi yopiladi), keyin SL narx ortidan 1 ATR masofada ergashadi. Tarixiy sinovda oltinda M15 ishladi, M30 va H1 zarar berdi." : "SL 2 ATR, TP1 0.5R (yarmi yopiladi), TP2 1.5R. Bu juftlik hali sinovda: natijang mijozlarga ochish-ochmaslikni hal qiladi."}
Ochiq savdolaringni har soatda qayta ko'rib, SL ni yaqinlashtirish yoki erta yopish imkoning bor: shuning uchun mantiqiy setup bo'lsa kirishdan qo'rqma.
Qoidalar:
- Faqat berilgan shamlar va ko'rsatkichlarga tayan. Daraja o'ylab topma, har bir daraja ma'lumotdagi narxga asoslansin.
- SL mantiqiy darajaning orqasida bo'lsin, masofasi H1 ATR ning 0.3-3 baravari. TP1 kamida 0.5R, TP2 kamida 1R va TP1 dan uzoqroq.
- Bozorda faol bo'l: trend, daraja va kirish nuqtasi mantiqiy bo'lsa BUY yoki SELL de, ishonch 50-60% bo'lsa ham.
  WAIT faqat bozor haqiqatan noaniq bo'lsa: yon harakat va ADX past, ko'rsatkichlar bir-biriga qarshi, narx SL qo'yib bo'lmaydigan joyda.
- Shu juftlikda ochiq savdong bo'lsa (oldingi_savdolaring, holat "open" yoki "tp1"), unga qarshi yo'nalishda kirma. Oldingi savdolaringdan saboq ol.
- WAIT bo'lsa sl, tp1, tp2 ni 0 qilib qo'y.
- confidence 0-100. reason o'zbek tilida (lotin), 4-8 jumla: trend, muhim darajalar, kirish sababi va qaysi holatda g'oya bekor bo'lishi.
- agree: robot_zeus_fikri bilan rozimisan ("rozi", "qisman", "qarshi").
${ANALYSIS_PROMPT}
Javob faqat JSON: {"action","sl","tp1","tp2","confidence","reason","agree","analysis"}.`;

const swingSystemFor = (pair: string) => `Sen Zeus Number One'ning swing treyderisan va ${pair} bilan demo hisobda 3-5 kunlik savdo qilasan.
Natijang haqqoniy R da o'lchanadi. Kuniga bitta qaror: BUY, SELL yoki WAIT. Kirish doim joriy narxda (bozor buyrug'i).
Qanday tahlil qilasan:
- Yuqoridan pastga: haftalik yo'nalish D1 shamlaridan, keyin D1 tuzilmasi (yuqori/past cho'qqilar, sinishlar), keyin H4 va H1 da kirish joyi.
- Katta talab/taklif zonalari, oldingi haftalik va kunlik cho'qqi/tublar (likvidlik), D1 EMA20/EMA50, RSI, ADX va D1 ATR.
- Savdo 3-5 kun ushlanadi, ${swingMaxH()} soatdan keyin joriy narxda yopiladi. Kunlik shovqin SL ga tegmasligi kerak.
${pair === PAIR
    ? "- Oltinda maqsad katta harakat: TP2 odatda 700-1000 pips (70-100 $) uzoqlikda, agar D1 tuzilmasi va ATR shunga yo'l qo'ysa. Yo'l qo'ymasa kichikroq maqsad yoki WAIT."
    : "- Maqsad D1 ATR ga mos bo'lsin: TP2 odatda 2-4 kunlik o'rtacha harakat. Valyutada 700-1000 pips 3-5 kunda deyarli bo'lmaydi, uni zo'rlama."}
Qoidalar:
- Faqat berilgan shamlar va ko'rsatkichlarga tayan. Daraja o'ylab topma, har bir daraja ma'lumotdagi narxga asoslansin.
- SL mantiqiy D1/H4 darajasining orqasida, masofasi D1 ATR ning 0.3-2 baravari. TP1 kamida 1R (yarmi yopiladi, SL kirishga ko'chadi), TP2 kamida 2R.
- Aniq ustunlik bo'lmasa WAIT de. Yomon savdodan WAIT yaxshi. Oldingi swing savdolaringdan saboq ol.
- WAIT bo'lsa sl, tp1, tp2 ni 0 qilib qo'y.
- confidence 0-100. reason o'zbek tilida (lotin), 4-8 jumla: haftalik va kunlik trend, muhim darajalar, kirish sababi, necha kunda maqsadga yetishi va qaysi holatda g'oya bekor bo'lishi.
- agree: robot_zeus_fikri bilan rozimisan ("rozi", "qisman", "qarshi").
${ANALYSIS_PROMPT}
Javob faqat JSON: {"action","sl","tp1","tp2","confidence","reason","agree","analysis"}.`;

export const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
export const ohlc = (cs: Candle[], d = 2) => cs.map((c) => [new Date(c.t).toISOString().slice(5, 16), round(c.o, d), round(c.h, d), round(c.l, d), round(c.c, d)]);
export function ind(cs: Candle[], d = 2) {
  const a = analyze(cs.slice(-200));
  return a && { trend: a.trend, ema20: round(a.ema20, d), ema50: round(a.ema50, d), rsi: Math.round(a.rsi), adx: Math.round(a.adx), atr: round(a.atr, d + 1) };
}

// Bozor ma'lumoti (shamlar, ko'rsatkichlar, Zeus fikri). Standart: oltin; Claude bahosi valyutalar uchun ham chaqiradi.
export async function facts(pair = PAIR) {
  const inst = ALL_INSTRUMENTS.find((i) => i.pair === pair) ?? gold();
  const [m15, h1, h4] = await Promise.all([getCandles(inst, 15, 260), getCandles(inst, 60, 260), getCandles(inst, 240, 260)]);
  const [states, ctx, past] = await Promise.all([
    sql<{ timeframe: string; side: string | null; quality: string | null; reason: string }>("SELECT timeframe, side, quality, reason FROM robot_state WHERE pair = $1", [inst.pair]),
    sql<{ timeframe: string; trend: string }>("SELECT timeframe, trend FROM market_context WHERE pair = $1", [inst.pair]),
    sql<AiTrade>("SELECT * FROM ai_trades WHERE pair = $1 AND action <> 'WAIT' ORDER BY at DESC LIMIT 8", [inst.pair]),
  ]);
  const h1a = analyze(h1.slice(-200));
  const d = digitsOf(inst.pair, m15.at(-1)?.c ?? 0);
  return {
    price: m15.at(-1)?.c ?? 0,
    lastTime: m15.at(-1)?.t ?? 0,
    atrH1: h1a?.atr ?? 0,
    data: {
      juftlik: inst.pair, hozir_utc: new Date().toISOString(), joriy_narx: round(m15.at(-1)?.c ?? 0, d),
      katta_trend: Object.fromEntries(ctx.map((c) => [c.timeframe, c.trend])),
      ko_rsatkichlar: { M15: ind(m15, d), H1: ind(h1, d), H4: ind(h4, d) },
      shamlar_ustunlari: "vaqt_utc, open, high, low, close",
      H4_shamlar: ohlc(h4.slice(-40), d),
      H1_shamlar: ohlc(h1.slice(-72), d),
      M15_shamlar: ohlc(m15.slice(-64), d),
      robot_zeus_fikri: states.map((s) => ({ tf: s.timeframe, yonalish: s.side, sifat: s.quality, sabab: s.reason })),
      oldingi_savdolaring: past.map((t) => ({ vaqt: t.at, yonalish: t.action, kirish: t.entry, sl: t.sl, tp1: t.tp1, tp2: t.tp2, holat: t.status, natija_R: t.result_r })),
    },
  };
}

// Swing uchun ma'lumot: D1 (oxirgi 120 kun), H4 va H1 shamlari, D1 ATR.
async function swingFacts(pair: string) {
  const inst = ALL_INSTRUMENTS.find((i) => i.pair === pair) ?? gold();
  const [d1, h4, h1] = await Promise.all([getContextCandles(inst, "D1"), getCandles(inst, 240, 260), getCandles(inst, 60, 260)]);
  const [states, past] = await Promise.all([
    sql<{ timeframe: string; side: string | null; quality: string | null; reason: string }>("SELECT timeframe, side, quality, reason FROM robot_state WHERE pair = $1", [inst.pair]),
    sql<AiTrade>("SELECT * FROM ai_trades WHERE pair = $1 AND mode = 'swing' AND action <> 'WAIT' ORDER BY at DESC LIMIT 8", [inst.pair]),
  ]);
  const price = h1.at(-1)?.c ?? 0;
  const d = digitsOf(inst.pair, price);
  const d1a = analyze(d1.slice(-200));
  return {
    price, lastTime: h1.at(-1)?.t ?? 0, atr: d1a?.atr ?? 0,
    data: {
      juftlik: inst.pair, rejim: "swing (3-5 kun)", hozir_utc: new Date().toISOString(), joriy_narx: round(price, d),
      ko_rsatkichlar: { D1: ind(d1, d), H4: ind(h4, d), H1: ind(h1, d) },
      shamlar_ustunlari: "vaqt_utc, open, high, low, close",
      D1_shamlar: ohlc(d1.slice(-120), d),
      H4_shamlar: ohlc(h4.slice(-60), d),
      H1_shamlar: ohlc(h1.slice(-48), d),
      robot_zeus_fikri: states.map((s) => ({ tf: s.timeframe, yonalish: s.side, sifat: s.quality, sabab: s.reason })),
      oldingi_swing_savdolaring: past.map((t) => ({ vaqt: t.at, yonalish: t.action, kirish: t.entry, sl: t.sl, tp1: t.tp1, tp2: t.tp2, holat: t.status, natija_R: t.result_r })),
    },
  };
}

export const planOf = (t: AiTrade): AiPlan => ({ side: t.action as "BUY" | "SELL", entry: Number(t.entry), sl: Number(t.sl), tp1: Number(t.tp1), tp2: Number(t.tp2) });

const STATUS_TEXT: Record<string, string> = { sl: "SL urildi", be: "TP1 dan keyin kirishda yopildi", tp2: "TP2 urildi", trail: "Claude ko'chirgan SL da yopildi", expired: "muddati o'tib yopildi" };

// Ochiq AI savdolarini yangilaydi (har 5 daqiqada, Twelve Data keshidan): kun ichidagilar M5 bo'yicha 24 soat,
// swing savdolar H1 bo'yicha swingMaxH() soat.
export async function trackAiTrades() {
  const open = await sql<AiTrade>("SELECT * FROM ai_trades WHERE status IN ('open', 'tp1') ORDER BY at");
  if (!open.length) return;
  const cache = new Map<string, Awaited<ReturnType<typeof getCandles>>>();
  for (const t of open) {
    const inst = ALL_INSTRUMENTS.find((i) => i.pair === t.pair) ?? gold();
    const swing = t.mode === "swing", key = `${inst.pair}|${swing ? 60 : 5}`;
    if (!cache.has(key)) cache.set(key, await getCandles(inst, swing ? 60 : 5, swing ? 260 : 600));
    const o = trackPlan(planOf(t), new Date(t.at).getTime(), cache.get(key)!, swing ? swingMaxH() : 24, Date.now(), t.stops ?? []);
    if (o.status === t.status && o.tp1Hit === t.tp1_hit) continue;
    const closed = o.resultR != null;
    await sql(
      `UPDATE ai_trades SET status = $2, tp1_hit = $3, result_r = $4, closed_at = $5, updated_at = now() WHERE id = $1`,
      [t.id, o.status, o.tp1Hit, o.resultR, closed && o.at ? new Date(o.at + (swing ? 60 : 5) * 60_000) : null],
    );
    const tag = swing ? " (swing)" : "";
    if (closed) await notifyAdmin(`🤖 AI${tag} ${t.action} ${t.pair} yopildi: ${STATUS_TEXT[o.status] ?? o.status}, natija ${o.resultR! >= 0 ? "+" : ""}${o.resultR!.toFixed(2)}R`);
    else if (o.tp1Hit && !t.tp1_hit) await notifyAdmin(`🤖 AI${tag} ${t.action} ${t.pair}: TP1 urildi, SL kirishga ko'chdi`);
  }
}

// Bitta qaror: vaqti kelgan birinchi juftlik (oltin oldin). Shu juftlikda ochiq savdo bo'lsa yoki bozor yopiq bo'lsa so'ralmaydi.
// force: admin "Hozir so'rash" tugmasi (pair berilmasa oltin).
export async function aiDecide(force = false, onlyPair?: string): Promise<{ trade?: AiTrade; skipped?: string }> {
  if (!aiTraderEnabled()) return { skipped: "AI ulanmagan" };
  const busyRows = await sql<{ pair: string }>(
    "SELECT pair FROM ai_trades WHERE mode = 'intraday' AND status IN ('open', 'tp1') GROUP BY pair HAVING count(*) >= $1", [maxOpen()],
  );
  const busy = new Set(busyRows.map((r) => r.pair));
  let pair: string | undefined;
  if (force) {
    pair = onlyPair ?? PAIR;
    if (busy.has(pair)) return { skipped: `${pair}: ${maxOpen()} ta ochiq AI savdo bor` };
  } else {
    const lastRows = await sql<{ pair: string; at: Date }>("SELECT pair, max(at) AS at FROM ai_trades WHERE mode = 'intraday' GROUP BY pair");
    const last = new Map(lastRows.map((r) => [r.pair, new Date(r.at).getTime()]));
    pair = traderPairs()
      .filter((i) => !busy.has(i.pair) && marketOpen(i.category) && Date.now() - (last.get(i.pair) ?? 0) >= (everyMin(i.pair) - 2) * 60_000)
      .sort((a, b) => (a.pair === PAIR ? -1 : b.pair === PAIR ? 1 : (last.get(a.pair) ?? 0) - (last.get(b.pair) ?? 0)))[0]?.pair;
    if (!pair) return { skipped: "Hali vaqti emas" };
    if (!(await underBudget())) return { skipped: "Kunlik AI chegarasi" };
  }
  const f = await facts(pair);
  if (!f.price || Date.now() - f.lastTime > 45 * 60_000) return { skipped: "Bozor yopiq" };

  const model = traderModel(pair);
  const text = await complete(systemFor(pair), [{ role: "user", content: JSON.stringify(f.data) }], {
    json: SCHEMA, model, maxTokens: provider() === "anthropic" ? 12000 : 3000,
  });
  return store(pair, "intraday", text, f.price, f.atrH1, undefined, model);
}

// Swing qarori: vaqti kelgan birinchi juftlik (oltin oldin), shu juftlikda ochiq swing savdo bo'lmasa.
export async function aiSwingDecide(force = false, onlyPair?: string): Promise<{ trade?: AiTrade; skipped?: string }> {
  if (!swingEnabled()) return { skipped: "Swing o'chiq" };
  const busyRows = await sql<{ pair: string }>("SELECT DISTINCT pair FROM ai_trades WHERE mode = 'swing' AND status IN ('open', 'tp1')");
  const busy = new Set(busyRows.map((r) => r.pair));
  let pair: string | undefined;
  if (force) {
    pair = onlyPair ?? PAIR;
    if (busy.has(pair)) return { skipped: `${pair}: ochiq swing savdo bor` };
  } else {
    const lastRows = await sql<{ pair: string; at: Date }>("SELECT pair, max(at) AS at FROM ai_trades WHERE mode = 'swing' GROUP BY pair");
    const last = new Map(lastRows.map((r) => [r.pair, new Date(r.at).getTime()]));
    pair = traderPairs()
      .filter((i) => !busy.has(i.pair) && marketOpen(i.category) && Date.now() - (last.get(i.pair) ?? 0) >= (swingEveryH() * 60 - 2) * 60_000)
      .sort((a, b) => (a.pair === PAIR ? -1 : b.pair === PAIR ? 1 : (last.get(a.pair) ?? 0) - (last.get(b.pair) ?? 0)))[0]?.pair;
    if (!pair) return { skipped: "Swing: hali vaqti emas" };
    if (!(await underBudget())) return { skipped: "Kunlik AI chegarasi" };
  }
  const f = await swingFacts(pair);
  if (!f.price || Date.now() - f.lastTime > 3 * 3600_000) return { skipped: "Bozor yopiq" };
  const model = traderModel(pair);
  const text = await complete(swingSystemFor(pair), [{ role: "user", content: JSON.stringify(f.data) }], {
    json: SCHEMA, model, maxTokens: provider() === "anthropic" ? 12000 : 3000,
  });
  return store(pair, "swing", text, f.price, f.atr, SWING_LIMITS, model);
}

// Qarorni tekshirib ai_trades va ai_views ga yozadi, aniq savdo bo'lsa adminga xabar beradi.
async function store(pair: string, mode: "intraday" | "swing", text: string, price: number, atr: number, lim: PlanLimits | undefined, model: string | undefined) {
  const d = parseDecision(text);
  const modelName = model ?? process.env.LLM_MODEL ?? provider() ?? "";
  if (!d) {
    const [row] = await sql<AiTrade>(
      "INSERT INTO ai_trades (pair, action, status, note, model, mode) VALUES ($1, 'WAIT', 'rejected', $2, $3, $4) RETURNING *",
      [pair, `Javob o'qilmadi: ${text.slice(0, 300)}`, modelName, mode],
    );
    return { trade: row };
  }
  const v = validatePlan(d, price, atr, lim);
  const p = v.plan;
  let analysis = null, agree: string | null = null;
  try {
    const o = JSON.parse(text.match(/\{[\s\S]*\}/)![0]);
    analysis = parseAnalysis(o.analysis, price);
    agree = ["rozi", "qisman", "qarshi"].includes(o.agree) ? o.agree : null;
  } catch { /* tahlil bo'lmasa ham qaror yoziladi */ }
  const status = p ? "open" : d.action === "WAIT" ? "wait" : "rejected";
  const [row] = await sql<AiTrade>(
    `INSERT INTO ai_trades (pair, action, status, entry, sl, tp1, tp2, confidence, reason, note, model, analysis, mode)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [pair, d.action, status, price, p?.sl ?? d.sl ?? null, p?.tp1 ?? d.tp1 ?? null, p?.tp2 ?? d.tp2 ?? null,
      d.confidence ?? 0, d.reason ?? "", status === "rejected" ? `Tekshiruvdan o'tmadi: ${v.error}` : "", modelName, analysis ? JSON.stringify(analysis) : null, mode],
  );
  // Swing qarori qisqa muddatli "Robot + Claude" ko'rinishini almashtirmaydi.
  if (mode === "intraday") await sql(
    "INSERT INTO ai_views (pair, bias, confidence, agree, summary, analysis, model) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [pair, d.action, d.confidence ?? 0, agree, d.reason ?? "", analysis ? JSON.stringify(analysis) : null, modelName],
  );
  if (p) {
    await notifyAdmin(`🤖 AI treyder${mode === "swing" ? " SWING (3-5 kun)" : ""} (demo): ${p.side} ${pair}\nKirish ${round(p.entry, digitsOf(pair, p.entry))}, SL ${p.sl}, TP1 ${p.tp1}, TP2 ${p.tp2}, ishonch ${d.confidence}%\n${d.reason ?? ""}`);
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
