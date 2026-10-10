import "server-only";
import { activeStop, parseReview, pipSize, resultAt, toPips, validateStopMove, type StopMove } from "../aiTrade.ts";
import { analyze } from "../engine.ts";
import { ALL_INSTRUMENTS } from "../instruments.ts";
import { getCandles } from "../market.ts";
import { digitsOf } from "./analysis.ts";
import { underBudget } from "./aiBudget.ts";
import { aiTraderEnabled, ind, ohlc, planOf, round, swingMaxH, traderModel, type AiTrade } from "./aiTrader.ts";
import { sql } from "./db.ts";
import { complete, provider } from "./llm.ts";
import { notifyAdmin } from "./telegram.ts";

// Claude ochiq savdolarini qayta ko'radi (egasining qarori, 2026-10-10): har savdo AI_REVIEW_EVERY_MIN (standart 60) daqiqada.
// Qarorlar: HOLD (ushlab turish), MOVE_SL (SL ni yaqinlashtirish, faqat xavfni kamaytiradi), CLOSE (joriy narxda yopish).
// Har qayta ko'rish ai_trade_reviews jadvaliga (Claude nazorat logi) yoziladi, SL ko'chsa yoki yopilsa adminga Telegram xabari.
// Faqat demo: MT5 EA hozircha Claude ko'chirgan SL ni va qo'lda yopishni olmaydi. O'chirish: AI_REVIEW=0.

export const reviewEnabled = () => aiTraderEnabled() && process.env.AI_REVIEW !== "0";
const everyMin = () => Math.max(15, Number(process.env.AI_REVIEW_EVERY_MIN ?? 60));

export type TradeReview = {
  id: number; trade_id: number; at: Date; pair: string; price: number | null; pips: number | null; result_r: number | null; stop: number | null;
  action: string; new_sl: number | null; applied: boolean; confidence: number; reason: string; note: string; model: string;
};

const SCHEMA = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["HOLD", "MOVE_SL", "CLOSE"] },
    new_sl: { type: "number" },
    confidence: { type: "integer" },
    reason: { type: "string" },
  },
  required: ["action", "new_sl", "confidence", "reason"],
  additionalProperties: false,
};

const SYSTEM = `Sen Zeus Number One'ning AI treyderisan va o'zing ochgan demo savdoni har soatda qayta ko'rib chiqasan.
Maqsad: foydani himoya qilish va zararni kamaytirish, lekin yaxshi savdoni erta yopib yubormaslik.
Qarorlar:
- HOLD: savdo g'oyasi hali to'g'ri, hech narsa o'zgartirilmaydi.
- MOVE_SL: SL ni narxga yaqinlashtir (faqat xavfni kamaytirish mumkin, uzoqlashtirib bo'lmaydi). new_sl yangi SL narxi,
  mantiqiy darajaning (oxirgi H1/M15 tub yoki cho'qqi) orqasida va joriy narxdan kamida 0.3 H1 ATR narida bo'lsin.
- CLOSE: g'oya buzildi (tuzilma teskari sindi, trend almashdi, narx muhim darajadan qaytdi) yoki foyda xavf ostida va davom etish ehtimoli past.
Qoidalar:
- Faqat berilgan shamlar va ko'rsatkichlarga tayan. Daraja o'ylab topma.
- TP1 urilgan bo'lsa SL allaqachon kirishda: yana yaqinlashtirish mumkin.
- Oldingi tekshiruvlaringni hisobga ol, har soatda fikr o'zgartirma: o'zgarish uchun yangi sabab bo'lsin.
- HOLD yoki CLOSE bo'lsa new_sl ni 0 qilib qo'y.
- confidence 0-100. reason o'zbek tilida (lotin), 2-5 jumla: hozirgi holat, nima o'zgardi, nega shu qaror.
Javob faqat JSON: {"action","new_sl","confidence","reason"}.`;

// Navbatdagi ochiq savdolar (eng uzoq qayta ko'rilmagani birinchi), har aylanishda ko'pi bilan `max` ta.
export async function reviewOpenTrades(max = 2): Promise<TradeReview[]> {
  if (!reviewEnabled()) return [];
  const due = await sql<AiTrade>(
    `SELECT * FROM ai_trades WHERE status IN ('open', 'tp1') AND coalesce(reviewed_at, at) < now() - make_interval(mins => $1)
     ORDER BY coalesce(reviewed_at, at) LIMIT $2`,
    [everyMin() - 2, max],
  );
  const out: TradeReview[] = [];
  for (const t of due) {
    if (!(await underBudget())) break;
    // Xato bo'lsa ham keyingi urinish bir soatdan keyin: har 5 daqiqada qayta so'ralmasin.
    await sql("UPDATE ai_trades SET reviewed_at = now() WHERE id = $1", [t.id]);
    const r = await reviewTrade(t).catch((e) => { console.error("AI qayta ko'rish", t.id, e); return null; });
    if (r) out.push(r);
  }
  return out;
}

async function reviewTrade(t: AiTrade): Promise<TradeReview | null> {
  const inst = ALL_INSTRUMENTS.find((i) => i.pair === t.pair);
  if (!inst) return null;
  const swing = t.mode === "swing";
  const [m15, h1, h4] = await Promise.all([getCandles(inst, 15, 260), getCandles(inst, 60, 260), getCandles(inst, 240, 260)]);
  const price = m15.at(-1)?.c ?? 0;
  if (!price || Date.now() - (m15.at(-1)?.t ?? 0) > 45 * 60_000) return null; // bozor yopiq
  const p = planOf(t);
  const dir = p.side === "BUY" ? 1 : -1;
  const stops = t.stops ?? [];
  const stop = activeStop(t.tp1_hit ? p.entry : p.sl, dir, stops);
  const d = digitsOf(t.pair, price);
  const pips = toPips(t.pair, (price - p.entry) * dir);
  const rNow = resultAt(p, price, t.tp1_hit);
  const atrH1 = analyze(h1.slice(-200))?.atr ?? 0;
  const past = await sql<TradeReview>("SELECT * FROM ai_trade_reviews WHERE trade_id = $1 ORDER BY at DESC LIMIT 4", [t.id]);
  const hours = (Date.now() - new Date(t.at).getTime()) / 3600_000;
  const data = {
    juftlik: t.pair, rejim: swing ? "swing (3-5 kun)" : "kun ichi", hozir_utc: new Date().toISOString(), joriy_narx: round(price, d),
    savdo: {
      yonalish: p.side, kirish: p.entry, boshlangich_sl: p.sl, joriy_sl: round(stop, d), tp1: p.tp1, tp2: p.tp2, tp1_urildi: t.tp1_hit,
      ochilgan_utc: new Date(t.at).toISOString(), otgan_soat: round(hours, 1), yopilish_muddati_soat: swing ? swingMaxH() : 24,
      suzuvchi_pips: round(pips, 1), suzuvchi_R: round(rNow, 2), sl_gacha_pips: round(toPips(t.pair, (price - stop) * dir), 1),
      ochilish_sababi: t.reason,
    },
    ko_rsatkichlar: { M15: ind(m15, d), H1: ind(h1, d), H4: ind(h4, d) },
    shamlar_ustunlari: "vaqt_utc, open, high, low, close",
    H4_shamlar: ohlc(h4.slice(swing ? -40 : -20), d),
    H1_shamlar: ohlc(h1.slice(swing ? -72 : -36), d),
    M15_shamlar: ohlc(m15.slice(-32), d),
    oldingi_tekshiruvlaring: past.map((r) => ({ vaqt: r.at, narx: r.price, qaror: r.action, yangi_sl: r.new_sl, sabab: r.reason })),
  };
  const model = traderModel(t.pair);
  const modelName = model ?? process.env.LLM_MODEL ?? provider() ?? "";
  const text = await complete(SYSTEM, [{ role: "user", content: JSON.stringify(data) }], { json: SCHEMA, model, maxTokens: 2000 });
  const v = parseReview(text);

  // Javob kelguncha savdo kuzatuvda yopilgan bo'lishi mumkin: faqat hali ochiq bo'lsa o'zgartiriladi.
  let applied = false, note = "";
  if (!v) note = `Javob o'qilmadi: ${text.slice(0, 200)}`;
  else if (v.action === "MOVE_SL") {
    const err = v.newSl == null ? "yangi SL berilmagan" : validateStopMove(p.side, stop, v.newSl, price, 0.2 * atrH1 || pipSize(t.pair) * 10);
    if (err) note = `SL ko'chirilmadi: ${err}`;
    else {
      const next: StopMove[] = [...stops, { t: Date.now(), sl: round(v.newSl!, d) }];
      const rows = await sql("UPDATE ai_trades SET stops = $2, updated_at = now() WHERE id = $1 AND status IN ('open', 'tp1') RETURNING id", [t.id, JSON.stringify(next)]);
      applied = rows.length > 0;
      if (!applied) note = "Savdo allaqachon yopilgan";
    }
  } else if (v.action === "CLOSE") {
    const rows = await sql(
      `UPDATE ai_trades SET status = 'closed', result_r = $2, exit_price = $3, closed_at = now(), updated_at = now()
       WHERE id = $1 AND status IN ('open', 'tp1') RETURNING id`,
      [t.id, rNow, price],
    );
    applied = rows.length > 0;
    if (!applied) note = "Savdo allaqachon yopilgan";
  }

  const [row] = await sql<TradeReview>(
    `INSERT INTO ai_trade_reviews (trade_id, pair, price, pips, result_r, stop, action, new_sl, applied, confidence, reason, note, model)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
    [t.id, t.pair, price, pips, rNow, stop, v?.action ?? "ERROR", v?.newSl ?? null, applied, v?.confidence ?? 0, v?.reason ?? "", note, modelName],
  );
  if (applied) {
    const tag = swing ? " (swing)" : "";
    const pp = `${pips >= 0 ? "+" : ""}${pips.toFixed(1)} pips`;
    await notifyAdmin(v!.action === "CLOSE"
      ? `🤖 AI${tag} ${p.side} ${t.pair}: Claude yopdi, ${round(price, d)} da, ${pp}, ${rNow >= 0 ? "+" : ""}${rNow.toFixed(2)}R\n${v!.reason}`
      : `🤖 AI${tag} ${p.side} ${t.pair}: Claude SL ni ${round(stop, d)} dan ${round(v!.newSl!, d)} ga ko'chirdi (${pp})\n${v!.reason}`);
  }
  return row;
}
