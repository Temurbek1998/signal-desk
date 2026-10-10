import "server-only";
import { ANALYSIS_PROMPT, ANALYSIS_SCHEMA, parseAnalysis, type AiAnalysis } from "../aiAnalysis.ts";
import { facts } from "./aiTrader.ts";
import { activeInstruments } from "../instruments.ts";
import { underBudget } from "./aiBudget.ts";
import { sql } from "./db.ts";
import { complete, provider } from "./llm.ts";

// Robot + Claude: Claude robot (Zeus) hisoblarini va shamlarni o'qiydi, robot bilan rozimi yoki yo'qmi aytadi
// va o'z tahlilini (strategiya, zonalar, darajalar) beradi. Faqat admin uchun; signal bermaydi.
// Oltin: AI treyder qarori bilan birga (aiTrader). Valyutalar: cron navbat bilan, har juftlik AI_VIEW_EVERY_H (standart 8) soatda.
// Model: AI_VIEW_MODEL (standart Sonnet: arzonroq, chunki bu admin ko'rinishi; mijozga ta'sir qiladigan baho Opus'da).

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

export async function claudeView(pair: string, pre?: Awaited<ReturnType<typeof facts>>): Promise<AiView> {
  const f = pre ?? await facts(pair);
  const model = process.env.AI_VIEW_MODEL || (provider() === "anthropic" ? "claude-sonnet-5-5" : undefined);
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
  // 4 kun: juma kechki tahlil dam olish kunlari ham grafikda qoladi.
  const [v] = await sql<AiView>("SELECT * FROM ai_views WHERE pair = $1 AND at > now() - interval '4 days' ORDER BY at DESC LIMIT 1", [pair]);
  return v ?? null;
}

// Cron: eng eski ko'rinishga ega valyuta juftligini yangilaydi (bir aylanishda bittasi), bozor ochiq va chegara ichida bo'lsa.
export async function refreshStaleView() {
  if (!provider() || process.env.AI_VIEW === "0" || !(await underBudget())) return;
  const every = Math.max(1, Number(process.env.AI_VIEW_EVERY_H ?? 8)) * 3600_000;
  const pairs = activeInstruments().map((i) => i.pair).filter((p) => p !== "XAU/USD" && !p.includes("/USDT"));
  if (!pairs.length) return;
  const rows = await sql<{ pair: string; at: Date }>("SELECT pair, max(at) AS at FROM ai_views GROUP BY pair");
  const last = new Map(rows.map((r) => [r.pair, new Date(r.at).getTime()]));
  const due = pairs.map((p) => ({ p, at: last.get(p) ?? 0 })).filter((x) => Date.now() - x.at >= every).sort((a, b) => a.at - b.at);
  for (const { p } of due) {
    const f = await facts(p).catch(() => null);
    // Bozor yopiq bo'lsa ham, juftlikda 4 kun ichida birorta tahlil bo'lmasa, oxirgi shamlar bo'yicha bitta chiziladi (grafik bo'sh qolmasin).
    const empty = Date.now() - (last.get(p) ?? 0) > 4 * 86_400_000;
    if (!f?.price || (!empty && Date.now() - f.lastTime > 3 * 3600_000)) continue;
    await claudeView(p, f);
    return;
  }
}
