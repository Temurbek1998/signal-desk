import "server-only";
import { ANALYSIS_PROMPT, ANALYSIS_SCHEMA, parseAnalysis } from "../aiAnalysis.ts";
import { facts, round } from "./aiTrader.ts";
import { digitsOf } from "./analysis.ts";
import { sql } from "./db.ts";
import { complete, provider } from "./llm.ts";
import { notifyAdmin } from "./telegram.ts";

// Zeus + AI hamkorligi: Zeus bergan har yangi kuchli signalni (oltin va valyutalar) AI mustaqil tahlil qiladi
// va "tasdiq" yoki "ehtiyot" deb baholaydi, sababini o'zbekcha yozadi.
// Claude yakuniy qaror qiladi (aiGateOn): mijozga faqat "tasdiq" olgan oltin signali ko'rinadi, "ehtiyot" esa ushlab qolinadi.
// Valyutalar hozircha faqat admin uchun sinovda: baho va tahlil yoziladi, mijozga chiqmaydi.
// Kripto (2026-10-10, egasi: "Zeus'ning miyasi Claude"): har kuchli signal baholanadi, demo hisobga faqat "tasdiq" olgani kiradi (demo.ts).
// AI_GATE=0 bo'lsa baho faqat izoh bo'lib qoladi va signalni to'xtatmaydi.

export const aiGateOn = () => !!provider() && process.env.AI_REVIEW !== "0" && process.env.AI_GATE !== "0";
// Claude tekshiruvidan o'tadigan signallar: oltinning asosiy (trend) strategiyasi.
export const gated = (pair: string, strategy?: string | null) => aiGateOn() && pair === "XAU/USD" && (strategy ?? "trend") === "trend";

const SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["tasdiq", "ehtiyot"] },
    confidence: { type: "integer" },
    note: { type: "string" },
    analysis: ANALYSIS_SCHEMA,
  },
  required: ["verdict", "confidence", "note", "analysis"],
  additionalProperties: false,
};

const SYSTEM = `Sen Signal Desk'da Zeus robotining hamkori bo'lgan AI tahlilchisan. Zeus qoidaga asoslangan robot: EMA20/EMA50 trendi, ADX >= 20,
H1 tasdig'i va RSI pullback bo'yicha signal beradi. Sen unga ikkinchi fikr berasan.
Vazifa: berilgan juftlik (oltin, valyuta yoki kripto) shamlari va ko'rsatkichlarini mustaqil tahlil qil (D1/H4 trendi, H1 tuzilmasi, M15, talab/taklif zonalari,
likvidlik, yaqin qarshilik va qo'llab-quvvatlash) va Zeus signalini baholab ber:
- "tasdiq": tahlilingiz signal yo'nalishini qo'llaydi va TP1 yo'lida kuchli to'siq yo'q.
- "ehtiyot": signal yo'nalishiga qarshi muhim daraja, zaif tuzilma yoki katta trendga zid holat bor.
Sening bahong yakuniy: "tasdiq" bo'lsa signal mijozlarga yuboriladi, "ehtiyot" bo'lsa ushlab qolinadi. Haqiqiy xavf ko'rsang ehtiyot de,
lekin har signalni bekorga rad etma: Zeus strategiyasi tarixiy sinovda ijobiy natija bergan.
Qoidalar: faqat berilgan ma'lumotga tayan, daraja o'ylab topma. Kafolat va foiz va'da qilma. Yangi kirish/TP/SL berma.
note: o'zbek tilida (lotin), 2-4 jumla, mijoz o'qiydi: asosiy sabab va kuzatish kerak bo'lgan aniq daraja. Unda o'zingni, AI yoki model nomini tilga olma.
confidence: 0-100, bahongga ishonching.
${ANALYSIS_PROMPT}
Javob faqat JSON.`;

type Row = { id: number; pair: string; timeframe: string; side: string; entry: number; tp1: number; tp2: number; sl: number; confidence: number; signal_time: Date };

export async function reviewNewSignals(limit = 2) {
  if (!provider() || process.env.AI_REVIEW === "0") return 0;
  const rows = await sql<Row>(
    `SELECT id, pair, timeframe, side, entry, tp1, tp2, sl, confidence, signal_time FROM signal_log
     WHERE category IN ('gold', 'forex', 'crypto') AND coalesce(strategy, 'trend') = 'trend' AND status = 'active' AND ai_at IS NULL
       AND signal_time > now() - interval '3 hours'
     ORDER BY (pair = 'XAU/USD') DESC, signal_time LIMIT $1`,
    [limit],
  );
  if (!rows.length) return 0;
  let done = 0;
  for (const r of rows) {
    // Bir signal ikki marta so'ralmasin (parallel cron chaqiruvlari).
    const claimed = await sql("UPDATE signal_log SET ai_at = now() WHERE id = $1 AND ai_at IS NULL RETURNING id", [r.id]);
    if (!claimed.length) continue;
    try {
      const f = await facts(r.pair);
      const d = digitsOf(r.pair, +r.entry);
      const zeus = { juftlik: r.pair, yonalish: r.side, taymfreym: r.timeframe, kirish: round(+r.entry, d), sl: round(+r.sl, d), tp1: round(+r.tp1, d), tp2: round(+r.tp2, d), ishonch: r.confidence, vaqt_utc: new Date(r.signal_time).toISOString() };
      const text = await complete(SYSTEM, [{ role: "user", content: JSON.stringify({ zeus_signali: zeus, bozor: f.data }) }], {
        json: SCHEMA, model: process.env.AI_TRADER_MODEL || (provider() === "anthropic" ? "claude-opus-5-5" : undefined), maxTokens: provider() === "anthropic" ? 12000 : 3000,
      });
      const m = text.match(/\{[\s\S]*\}/);
      const o = m ? JSON.parse(m[0]) : null;
      const verdict = o?.verdict === "tasdiq" || o?.verdict === "ehtiyot" ? o.verdict : null;
      if (!verdict) throw new Error("javobda baho yo'q");
      const conf = Math.max(0, Math.min(100, Math.round(Number(o.confidence) || 0)));
      const note = String(o.note ?? "").slice(0, 800);
      const analysis = parseAnalysis(o.analysis, f.price);
      await sql("UPDATE signal_log SET ai_verdict = $2, ai_confidence = $3, ai_note = $4, ai_analysis = $5 WHERE id = $1",
        [r.id, verdict, conf, note, analysis ? JSON.stringify(analysis) : null]);
      await notifyAdmin(`🤝 AI fikri (${r.side} ${r.pair} ${r.timeframe}): ${verdict === "tasdiq" ? "✅ tasdiq" : "⚠️ ehtiyot"} ${conf}%${gated(r.pair) ? (verdict === "tasdiq" ? ", mijozlarga ochildi" : ", mijozlarga yuborilmadi") : ""}\n${note}`);
      done++;
    } catch (e) {
      // Keyingi cron'da qayta so'raladi (3 soatlik oyna ichida); shu vaqtgacha signal mijozga ko'rinmaydi.
      await sql("UPDATE signal_log SET ai_at = NULL WHERE id = $1", [r.id]);
      console.error("AI baho", e);
    }
  }
  return done;
}

// Tasdiqlangan va "ehtiyot" deb baholangan signallarning yopilgan natijasi: AI fikri foyda beryaptimi.
export async function reviewStats() {
  return sql<{ verdict: string; n: string; wins: string; total: number | null }>(
    `SELECT ai_verdict AS verdict, count(*) AS n, count(*) FILTER (WHERE result_r > 0) AS wins, sum(result_r) AS total
     FROM signal_log WHERE ai_verdict IS NOT NULL AND status <> 'active' AND result_r IS NOT NULL GROUP BY ai_verdict`,
  );
}
