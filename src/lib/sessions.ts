// Bozor ish vaqti (UTC). Oltin va forex: yakshanba 22:00 dan juma 21:00 gacha, har kuni 21:00-22:00 tanaffus.
// Kripto 24/7 ochiq.
export function marketOpen(category: string, t: number = Date.now()): boolean {
  if (category === "crypto") return true;
  const d = new Date(t);
  const day = d.getUTCDay(), h = d.getUTCHours();
  if (h === 21) return false;
  if (day === 6) return false;
  if (day === 5 && h >= 21) return false;
  if (day === 0 && h < 22) return false;
  return true;
}

// Bozor keyingi ochiladigan vaqt (ms). Ochiq bo'lsa hozirgi vaqtni qaytaradi.
export function nextOpen(category: string, t: number = Date.now()): number {
  if (marketOpen(category, t)) return t;
  let x = Math.ceil(t / 3600_000) * 3600_000;
  for (let i = 0; i < 24 * 8 && !marketOpen(category, x); i++) x += 3600_000;
  return x;
}
