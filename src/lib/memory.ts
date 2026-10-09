// Robot xotirasi: har bir juftlik va taymfreymdagi o'tgan signallar natijasidan kelajakdagi
// signal sifatini baholash. Sof funksiyalar, bazasiz sinash mumkin.

// Tarixiy sinovdagi o'rtacha win rate boshlang'ich taxmin sifatida olinadi va
// PRIOR_WEIGHT ta "virtual" signalga teng og'irlik beriladi. Jonli natijalar to'plangan sari
// baho shu juftlikning haqiqiy natijasiga yaqinlashadi.
export const PRIOR_WINRATE = 0.72;
export const PRIOR_WEIGHT = 10;
export const COLD_START_N = 10; // juftlik bo'yicha shuncha signal yig'ilguncha boshlang'ich qoida
export const MIN_FOR_BLOCK = 12; // shuncha signaldan keyin yomon natija bloklashga sabab bo'ladi

export type Memory = { n: number; wins: number };
export type Rating = "A" | "B" | "C";

export function estimate(m: Memory): number {
  return (m.wins + PRIOR_WINRATE * PRIOR_WEIGHT) / (m.n + PRIOR_WEIGHT);
}

// A: xotira bo'yicha kutilgan win rate >= 74% va ishonch yuqori.
// B: >= 64%.
// C: past natija yoki juftlik/taymfreym xotira bo'yicha bloklangan; faqat adminga ko'rinadi.
export function rate(confidence: number, pairMem: Memory, sideMem: Memory): { rating: Rating; est: number; reason: string } {
  const est = 0.7 * estimate(pairMem) + 0.3 * estimate(sideMem);
  const blocked = pairMem.n >= MIN_FOR_BLOCK && pairMem.wins / pairMem.n < 0.5;
  if (blocked) return { rating: "C", est, reason: `Xotira: oxirgi ${pairMem.n} signalda faqat ${Math.round((pairMem.wins / pairMem.n) * 100)}% yutuq, vaqtincha bloklangan` };
  if (est >= 0.74 && confidence >= 70) return { rating: "A", est, reason: `Xotira bo'yicha kutilgan natija ${Math.round(est * 100)}%` };
  // Ishga tushgan dastlabki kunlar: xotira hali yig'ilmagan, shuning uchun A uchun yuqoriroq ishonch talab qilinadi
  // (tarixiy sinovda ishonch >= 75 bo'lgan signallar 77-79% natija bergan).
  if (pairMem.n < COLD_START_N && est >= 0.7 && confidence >= 75) {
    return { rating: "A", est, reason: `Xotira hali yig'ilmoqda (${pairMem.n} signal), ishonch yuqori: ${confidence}%` };
  }
  if (est >= 0.64) return { rating: "B", est, reason: `Xotira bo'yicha kutilgan natija ${Math.round(est * 100)}%` };
  return { rating: "C", est, reason: `Xotira bo'yicha kutilgan natija past: ${Math.round(est * 100)}%` };
}

// Pips rejimi (SL 200, TP 300–400): yutuq zarardan 1.5–2 baravar katta, shuning uchun ~40% win ham foydali.
// Tarixiy sinovdagi ~48% boshlang'ich taxmin; xotirada natija 40% dan pastga tushsa C (faqat admin).
export const PIPS_PRIOR_WINRATE = 0.48;
export function ratePips(m: Memory): { rating: Rating; est: number; reason: string } {
  const est = (m.wins + PIPS_PRIOR_WINRATE * PRIOR_WEIGHT) / (m.n + PRIOR_WEIGHT);
  if (est >= 0.4) return { rating: "A", est, reason: `Pips rejimi: kutilgan natija ${Math.round(est * 100)}% (TP SL dan 1.5–2 baravar katta)` };
  return { rating: "C", est, reason: `Pips rejimi xotirada zaif: ${Math.round(est * 100)}%` };
}

export type Tier = "standard" | "pro" | "vip" | "admin";
export type PaidTier = Exclude<Tier, "admin">;
export const PAID_TIERS: PaidTier[] = ["standard", "pro", "vip"];
export const TIER_NAME: Record<Tier, string> = { standard: "Standart", pro: "PRO", vip: "VIP", admin: "Admin" };

// Har bir daraja qaysi reytingdagi signallarni va kuniga nechtasini ko'radi.
export const TIER_RULES: Record<Tier, { ratings: Rating[]; daily: number }> = {
  // Mijozlarga kuniga 1-2 ta eng aniq signal; admin hammasini ko'radi va Telegramda oladi.
  standard: { ratings: ["A"], daily: 2 },
  pro: { ratings: ["A", "B"], daily: 2 },
  vip: { ratings: ["A", "B"], daily: 2 },
  admin: { ratings: ["A", "B", "C"], daily: Infinity },
};

// Kunning signallari (vaqt bo'yicha tartiblangan) ichidan shu daraja ko'radiganlarini tanlaydi.
export function allocate<T extends { rating: string | null }>(todays: T[], tier: Tier): T[] {
  const r = TIER_RULES[tier];
  return todays.filter((s) => r.ratings.includes((s.rating ?? "C") as Rating)).slice(0, r.daily);
}
