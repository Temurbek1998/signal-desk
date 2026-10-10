// Demo hisob hisob-kitobi: sof funksiyalar, bazasiz sinash mumkin.

export type DemoConfig = {
  startBalance: number; riskPct: number; leverage: number; feeCryptoPct: number; feeFxPct: number; ratings: string[];
  minLots: number; fixedLots: number | null;
};

export function demoConfig(env: Record<string, string | undefined> = process.env): DemoConfig {
  const num = (v: string | undefined, d: number, min: number, max: number) => {
    const n = Number(v);
    return v && Number.isFinite(n) && n >= min && n <= max ? n : d;
  };
  return {
    startBalance: num(env.DEMO_START_BALANCE, 100_000, 100, 10_000_000), // Bek qarori (2026-10-10): 100 000 $
    riskPct: num(env.DEMO_RISK_PCT, 1, 0.1, 5),
    leverage: num(env.DEMO_LEVERAGE, 1000, 1, 3000), // plecho 1:N (Bek qarori: 1:1000)
    feeCryptoPct: num(env.DEMO_FEE_CRYPTO_PCT, 0.04, 0, 1),
    feeFxPct: num(env.DEMO_FEE_FX_PCT, 0.005, 0, 1),
    // Bek qarori (2026-10-10): oltin va valyutada kamida 0.05 lot. DEMO_LOTS berilsa har savdo shu qat'iy lot bilan.
    minLots: num(env.DEMO_MIN_LOTS, 0.05, 0, 100),
    fixedLots: env.DEMO_LOTS ? num(env.DEMO_LOTS, 0, 0.01, 100) || null : null,
    ratings: (env.DEMO_RATINGS ?? "A,B,C").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
  };
}

// Pozitsiya hajmi: SL urilsa balansning riskPct foizi yo'qotiladi. Komissiya kirish va chiqish uchun.
export function position(balance: number, cfg: DemoConfig, category: string, entry: number, sl: number) {
  const risk = (balance * cfg.riskPct) / 100;
  const dist = Math.abs(entry - sl);
  // Plecho garov (marja) hajmini belgilaydi: marja = pozitsiya qiymati / plecho. Marja balansdan oshmasin.
  const lev = cfg.leverage ?? 1;
  let size = dist > 0 ? risk / dist : 0;
  // Oltin va valyutada lot: qat'iy (DEMO_LOTS) yoki kamida minLots. Kriptoda lot yo'q.
  if (size > 0 && category !== "crypto") {
    const unit = lotSize(category);
    if (cfg.fixedLots) size = cfg.fixedLots * unit;
    else if (cfg.minLots) size = Math.max(size, cfg.minLots * unit);
  }
  size = Math.min(size, (balance * lev) / entry);
  const notional = size * entry;
  const feePct = category === "crypto" ? cfg.feeCryptoPct : cfg.feeFxPct;
  const fee = (notional * feePct * 2) / 100;
  return { risk: size * dist, size, notional, fee, margin: notional / lev };
}

export const pnlOf = (resultR: number, risk: number, fee: number) => resultR * risk - fee;

// Eng katta pasayish (cho'qqidan tubgacha), foizda.
export function maxDrawdown(equity: number[]): number {
  let peak = -Infinity, dd = 0;
  for (const e of equity) {
    peak = Math.max(peak, e);
    if (peak > 0) dd = Math.max(dd, (peak - e) / peak);
  }
  return dd * 100;
}

// Standart lot hajmi: oltin 1 lot = 100 unsiya, forex 1 lot = 100 000 bazaviy valyuta, kriptoda lot = tanga soni.
export function lotSize(category: string): number {
  return category === "gold" ? 100 : category === "forex" ? 100_000 : 1;
}
export const lotsOf = (category: string, size: number) => size / lotSize(category);

export type StrategyRow = { strategy: string; trades: number; wins: number; net: number };

// Yopilgan savdolar strategiya bo'yicha (trend va oltin pips rejimlari alohida).
export function strategyStats(trades: { strategy?: string | null; pnl: number | null }[]): StrategyRow[] {
  const map = new Map<string, StrategyRow>();
  for (const t of trades) {
    if (t.pnl == null) continue;
    const k = t.strategy ?? "trend";
    const r = map.get(k) ?? { strategy: k, trades: 0, wins: 0, net: 0 };
    r.trades++;
    if (Number(t.pnl) > 0) r.wins++;
    r.net += Number(t.pnl);
    map.set(k, r);
  }
  return [...map.values()].sort((a, b) => b.trades - a.trades);
}

export type DayRow = { day: string; trades: number; wins: number; losses: number; profit: number; loss: number; fees: number; net: number };

// Yopilgan savdolarni kunlar bo'yicha yig'adi (Toshkent vaqti), eng yangi kun birinchi.
export function dailyStats(trades: { closed_at: Date | string | null; pnl: number | null; fee: number; outcome: string | null }[], tz = "Asia/Tashkent"): DayRow[] {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const map = new Map<string, DayRow>();
  for (const t of trades) {
    if (!t.closed_at || t.pnl == null) continue;
    const day = fmt.format(new Date(t.closed_at));
    const r = map.get(day) ?? { day, trades: 0, wins: 0, losses: 0, profit: 0, loss: 0, fees: 0, net: 0 };
    const pnl = Number(t.pnl);
    r.trades++;
    if (pnl >= 0) { r.wins++; r.profit += pnl; } else { r.losses++; r.loss += -pnl; }
    r.fees += Number(t.fee);
    r.net += pnl;
    map.set(day, r);
  }
  return [...map.values()].sort((a, b) => (a.day < b.day ? 1 : -1));
}
