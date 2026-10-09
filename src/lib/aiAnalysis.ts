// Claude'ning to'liq tahlili: strategiya, trendlar, darajalar, zonalar, sabablar va xavflar.
// Faqat admin panelda grafikda chiziladi, mijozga ko'rinmaydi. Sof mantiq: testlanadi.

export type Trend = "up" | "down" | "flat";
export type LevelKind = "support" | "resistance" | "demand" | "supply" | "liquidity";
export type AiAnalysis = {
  strategy: string;
  trends: { D1: Trend; H4: Trend; H1: Trend; M15: Trend };
  levels: { price: number; kind: LevelKind; note: string }[];
  zones: { from: number; to: number; kind: "demand" | "supply"; note: string }[];
  reasons: string[];
  risks: string[];
  invalidation: number | null;
  scenario: string;
};

const TREND = { type: "string", enum: ["up", "down", "flat"] };

// Model javobi uchun JSON sxema (verdict yoki qaror sxemasiga "analysis" bo'lib qo'shiladi).
export const ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    strategy: { type: "string" },
    trends: {
      type: "object",
      properties: { D1: TREND, H4: TREND, H1: TREND, M15: TREND },
      required: ["D1", "H4", "H1", "M15"],
      additionalProperties: false,
    },
    levels: {
      type: "array",
      items: {
        type: "object",
        properties: { price: { type: "number" }, kind: { type: "string", enum: ["support", "resistance", "demand", "supply", "liquidity"] }, note: { type: "string" } },
        required: ["price", "kind", "note"],
        additionalProperties: false,
      },
    },
    zones: {
      type: "array",
      items: {
        type: "object",
        properties: { from: { type: "number" }, to: { type: "number" }, kind: { type: "string", enum: ["demand", "supply"] }, note: { type: "string" } },
        required: ["from", "to", "kind", "note"],
        additionalProperties: false,
      },
    },
    reasons: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    invalidation: { type: "number" },
    scenario: { type: "string" },
  },
  required: ["strategy", "trends", "levels", "zones", "reasons", "risks", "invalidation", "scenario"],
  additionalProperties: false,
};

// Promptga qo'shiladigan izoh: analysis maydonini qanday to'ldirish.
export const ANALYSIS_PROMPT = `analysis maydoni (faqat admin ko'radi, grafikda chiziladi), o'zbek tilida (lotin):
- strategy: qaysi strategiya bilan ishlayapsan (masalan "Trend davomi: H1 trendida pullback, talab zonasidan kirish"), 1-2 jumla.
- trends: D1, H4, H1, M15 trendi (up/down/flat).
- levels: 3-8 ta muhim daraja (support, resistance, demand, supply, liquidity) va qisqa izoh. Faqat shamlardagi haqiqiy narxlar.
- zones: 0-4 ta talab (demand) yoki taklif (supply) zonasi, from va to narxlari bilan.
- reasons: qarorga asos bo'lgan 3-6 ta aniq sabab. risks: 1-4 ta xavf.
- invalidation: g'oya bekor bo'ladigan narx (bilmasang 0). scenario: keyingi soatlarda kutilgan harakat, 2-3 jumla.`;

const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown, max = 600) => String(v ?? "").trim().slice(0, max);
const trend = (v: unknown): Trend => (v === "up" || v === "down" ? v : "flat");
const LEVELS = new Set(["support", "resistance", "demand", "supply", "liquidity"]);

// Model javobidagi tahlilni tozalaydi: noto'g'ri yoki joriy narxdan juda uzoq (±15%) darajalar tashlanadi.
export function parseAnalysis(o: unknown, price: number): AiAnalysis | null {
  if (!o || typeof o !== "object") return null;
  const a = o as Record<string, unknown>;
  const near = (p: number | null): p is number => p != null && p > 0 && (!price || Math.abs(p - price) / price < 0.15);
  const t = (a.trends ?? {}) as Record<string, unknown>;
  const levels = (Array.isArray(a.levels) ? a.levels : [])
    .map((l) => ({ price: num(l?.price), kind: String(l?.kind), note: str(l?.note, 200) }))
    .filter((l) => near(l.price) && LEVELS.has(l.kind))
    .map((l) => ({ ...l, price: l.price as number, kind: l.kind as LevelKind }))
    .slice(0, 10);
  const zones = (Array.isArray(a.zones) ? a.zones : [])
    .map((z) => {
      const f = num(z?.from), to = num(z?.to);
      return { from: Math.min(f ?? 0, to ?? 0), to: Math.max(f ?? 0, to ?? 0), kind: z?.kind === "supply" ? "supply" as const : "demand" as const, note: str(z?.note, 200) };
    })
    .filter((z) => near(z.from) && near(z.to) && z.to > z.from)
    .slice(0, 6);
  const list = (v: unknown) => (Array.isArray(v) ? v.map((x) => str(x, 300)).filter(Boolean).slice(0, 8) : []);
  const inv = num(a.invalidation);
  return {
    strategy: str(a.strategy, 400),
    trends: { D1: trend(t.D1), H4: trend(t.H4), H1: trend(t.H1), M15: trend(t.M15) },
    levels, zones,
    reasons: list(a.reasons), risks: list(a.risks),
    invalidation: near(inv) ? inv : null,
    scenario: str(a.scenario, 800),
  };
}
