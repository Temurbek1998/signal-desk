import "server-only";
import { ANALYSIS_PROMPT, ANALYSIS_SCHEMA, parseAnalysis, type AiAnalysis } from "../aiAnalysis.ts";
import { facts } from "./aiTrader.ts";
import { sql } from "./db.ts";
import { complete, provider } from "./llm.ts";

// Robot + Claude: Claude robot (Zeus) hisoblarini va shamlarni o'qiydi, robot bilan rozimi yoki yo'qmi aytadi
// va o'z tahlilini (strategiya, zonalar, darajalar) beradi. Faqat admin uchun; signal bermaydi.
// Oltin uchun har soatda avtomatik (cron), boshqa juftliklar admin tugmasi bilan.

export type AiView = {
  id: number; pair: string; at: Date; bias: "BUY" | "SELL" | "WAIT"; confidence: number;
  agree: string | null; summary: string; analysis: AiAnalysis | null; model: string | null;
};

const SCHEMA = {
  type: "object",
  properties: {
    bias: { type: "string", enum: ["BUY", "SELL", "WAIT"] },
    confidence: { type: "integer" },
    agree: { type: "string", enum: ["rozi", "qisman", "qarshi"] },
    summary: { type: "string" },
    analysis: ANALYSIS_SCHEMA,
  },
  required: ["bias", "confidence", "agree", "summary", "analysis"],
  additionalProperties: false,
};

const SYSTEM = `Sen Signal Desk'da Zeus robotining "miyasi"san. Zeus qoidaga asoslangan robot: EMA20/EMA50 trendi, ADX >= 20,
katta taymfreym tasdig'i va RSI pullback bo'yicha ishlaydi. U hisoblaydi, sen tushunasan.
Vazifa: berilgan juftlikning shamlari, ko'rsatkichlari va robot_zeus_fikri ni o'qib, bozorni to'liq tahlil qil:
D1/H4 trendi, H1 tuzilmasi (yuqori/past cho'qqilar), M15, talab/taklif zonalari, likvidlik, tayanch va qarshilik.
- bias: hozir qaysi tomon ustun (BUY, SELL yoki aniq ustunlik bo'lmasa WAIT). confidence 0-100.
- agree: robot xulosalari bilan rozimisan ("rozi", "qisman", "qarshi").
- summary: o'zbek tilida (lotin), 4-7 jumla, admin uchun: robot nima deyapti, sen nimani ko'ryapsan, qaysi zonadan kirish mantiqiy,
  stop qayerda bo'lishi kerak va nima uchun, maqsad qayergacha, nima bo'lsa fikr o'zgaradi.
Qoidalar: faqat berilgan ma'lumotga tayan, daraja o'ylab topma. Kafolat va'da qilma.
${ANALYSIS_PROMPT}
Javob faqat JSON.`;

export async function claudeView(pair: string): Promise<AiView> {
  const f = await facts(pair);
  const model = process.env.AI_TRADER_MODEL || (provider() === "anthropic" ? "claude-opus-5-5" : undefined);
  const text = await complete(SYSTEM, [{ role: "user", content: JSON.stringify(f.data) }], {
    json: SCHEMA, model, maxTokens: provider() === "anthropic" ? 12000 : 3000,
  });
  const m = text.match(/\{[\s\S]*\}/);
  const o = m ? JSON.parse(m[0]) : null;
  if (!o) throw new Error("Claude javobi o'qilmadi");
  const bias = o.bias === "BUY" || o.bias === "SELL" ? o.bias : "WAIT";
  const agree = ["rozi", "qisman", "qarshi"].includes(o.agree) ? o.agree : null;
  const analysis = parseAnalysis(o.analysis, f.price);
  const [row] = await sql<AiView>(
    `INSERT INTO ai_views (pair, bias, confidence, agree, summary, analysis, model) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [f.data.juftlik, bias, Math.max(0, Math.min(100, Math.round(Number(o.confidence) || 0))), agree, String(o.summary ?? "").slice(0, 3000),
      analysis ? JSON.stringify(analysis) : null, model ?? provider() ?? ""],
  );
  return row;
}

export async function latestView(pair: string): Promise<AiView | null> {
  const [v] = await sql<AiView>("SELECT * FROM ai_views WHERE pair = $1 AND at > now() - interval '2 days' ORDER BY at DESC LIMIT 1", [pair]);
  return v ?? null;
}

// Cron: oltin uchun soatiga bir marta, bozor ochiq bo'lsa.
export async function refreshGoldView() {
  if (!provider() || process.env.AI_VIEW === "0") return;
  const v = await latestView("XAU/USD");
  if (v && Date.now() - new Date(v.at).getTime() < 58 * 60_000) return;
  const f = await facts("XAU/USD");
  if (!f.price || Date.now() - f.lastTime > 45 * 60_000) return;
  await claudeView("XAU/USD");
}
