// Keyingi ishga tushish: interval chegarasidan (sham yopilishidan) bir necha soniya keyin.
// Shunda M15/M30 shami yopilishi bilan robot darhol tahlil qiladi va signalni kechiktirmaydi.
export function nextRunDelay(now: number, minutes: number, lagMs = 5000): number {
  const step = minutes * 60_000;
  return Math.ceil((now - lagMs + 1) / step) * step + lagMs - now;
}
