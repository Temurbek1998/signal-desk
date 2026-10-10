// Demo savdo izohi (egasining talabi, 2026-10-10): yopilgan savdo foyda yoki zarar bilan tugadimi, qaysi darajada va necha pips.
// Sof funksiya, bazasiz sinash mumkin. Sababini Claude yozadi: server/demoReview.ts.
import { pipSize } from "./aiTrade.ts";

export type NoteInput = { pair: string; side: string; entry: number; sl: number; outcome: string | null; result_r: number | null; pnl: number | null };

const WHERE: Record<string, string> = {
  tp2: "narx TP 2 ga yetdi, savdo to'liq maqsadda yopildi",
  tp1: "narx TP 1 ga yetdi va yarmi yopildi, qolgani kirish narxida yopildi",
  be: "narx TP 1 ga yetdi, so'ng qaytib kirish narxida (zararsiz) yopildi",
  sl: "narx teskari ketib SL ga urildi",
  trail: "Claude yaqinlashtirgan SL ga urildi",
  closed: "Claude savdoni muddatidan oldin yopdi",
  expired: "savdo muddati tugab, joriy narxda yopildi",
  close: "kun oxirida joriy narxda yopildi",
};

const sgn = (x: number, d = 0) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}`;

// Natija pips da: R * SL masofasi (TP1 dan keyingi qism ham R ichida hisoblangan).
export function resultPips(t: Pick<NoteInput, "pair" | "entry" | "sl" | "result_r">): number | null {
  if (t.result_r == null) return null;
  return (Number(t.result_r) * Math.abs(Number(t.entry) - Number(t.sl))) / pipSize(t.pair);
}

export function outcomeNote(t: NoteInput): { win: boolean | null; text: string } {
  const pnl = t.pnl == null ? null : Number(t.pnl);
  const r = t.result_r == null ? null : Number(t.result_r);
  const win = pnl != null ? pnl > 0 : r != null ? r > 0 : null;
  // R nolga yaqin bo'lsa (kirishda yopilgan) zararsiz: faqat komissiya.
  const head = r != null && Math.abs(r) < 0.01 ? "Zararsiz" : win == null ? "Natija" : win ? "Foyda" : "Zarar";
  const where = WHERE[t.outcome ?? ""] ?? `natija: ${t.outcome ?? "noma'lum"}`;
  const pips = resultPips(t);
  const parts = [pips != null ? `${sgn(pips)} pips` : null, r != null ? `${sgn(r, 2)}R` : null, pnl != null ? `${sgn(pnl, 2)} USDT` : null].filter(Boolean);
  return { win, text: `${head}: ${where}${parts.length ? ` (${parts.join(", ")})` : ""}.` };
}
