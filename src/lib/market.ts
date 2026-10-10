import type { Candle, ContextTf, Instrument, Timeframe } from "./types.ts";

const MINUTES: Record<Timeframe, number> = { M5: 5, M15: 15, M30: 30, H1: 60 };
const LIMIT = 200;
const REVALIDATE = 30; // soniya: bir xil so'rovlar shu vaqt ichida keshdan olinadi

type FetchInit = RequestInit & { next?: { revalidate: number } };

async function getJson(url: string, init: FetchInit = {}, revalidate = REVALIDATE) {
  const res = await fetch(url, (revalidate ? { ...init, next: { revalidate } } : { ...init, cache: "no-store" }) as FetchInit);
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

// Hali yopilmagan oxirgi shamni olib tashlaydi: signal faqat yopilgan shamlarda hisoblanadi.
function closedOnly(candles: Candle[], minutes: number): Candle[] {
  const now = Date.now();
  return candles.filter((c) => c.t + minutes * 60_000 <= now);
}

// data-api.binance.vision: Binance bozor ma'lumotlari uchun ochiq manzil, AQSh serverlaridan ham ishlaydi.
async function binance(symbol: string, minutes: number, limit = LIMIT): Promise<Candle[]> {
  const interval = minutes === 60 ? "1h" : minutes === 240 ? "4h" : `${minutes}m`;
  const rows: unknown[][] = await getJson(
    `https://data-api.binance.vision/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`,
  );
  return rows.map((r) => ({ t: Number(r[0]), o: +String(r[1]), h: +String(r[2]), l: +String(r[3]), c: +String(r[4]) }));
}

async function yahoo(symbol: string, minutes: number, limit = LIMIT): Promise<Candle[]> {
  // Yahoo 4 soatlik interval bermaydi ("240m" ga 400 qaytaradi): H4 3 oylik H1 shamlaridan vaqt bo'yicha yig'iladi.
  if (minutes === 240) return bucketByTime(await yahoo(symbol, 60, 2000), 240).slice(-limit);
  const interval = minutes === 60 ? "60m" : `${minutes}m`;
  const range = minutes >= 60 ? (limit > LIMIT ? "3mo" : "1mo") : "5d";
  const data = await getJson(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`,
    { headers: { "User-Agent": "Mozilla/5.0 (signal-desk)" } },
  );
  const r = data?.chart?.result?.[0];
  if (!r) throw new Error("Yahoo: ma'lumot yo'q");
  const q = r.indicators.quote[0];
  const out: Candle[] = [];
  r.timestamp.forEach((ts: number, i: number) => {
    if ([q.open[i], q.high[i], q.low[i], q.close[i]].some((v) => v == null)) return;
    out.push({ t: ts * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] });
  });
  return out.slice(-limit);
}

// Twelve Data bepul tarifi kuniga 800 so'rov beradi. Shuning uchun har aylanishda bitta so'rov bilan
// 5000 ta M5 sham (~17 kun) olinadi va M15, M30, H1, H4 shulardan vaqt bo'yicha yig'iladi.
async function twelvedata(symbol: string, minutes: number, limit = LIMIT): Promise<Candle[]> {
  const m5 = await twelvedataM5(symbol);
  return minutes === 5 ? m5.slice(-limit) : bucketByTime(m5, minutes).slice(-limit);
}

// Bir aylanishdagi parallel so'rovlar bitta tarmoq chaqiruvini bo'lishadi (60 soniya).
const m5Cache = new Map<string, { at: number; p: Promise<Candle[]> }>();
function twelvedataM5(symbol: string): Promise<Candle[]> {
  const hit = m5Cache.get(symbol);
  if (hit && Date.now() - hit.at < 60_000) return hit.p;
  const p = fetchTwelvedataM5(symbol);
  m5Cache.set(symbol, { at: Date.now(), p });
  p.catch(() => m5Cache.delete(symbol));
  return p;
}

async function fetchTwelvedataM5(symbol: string): Promise<Candle[]> {
  const data = await getJson(
    `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=5min&outputsize=5000&order=asc&timezone=UTC&apikey=${process.env.TWELVEDATA_API_KEY}`,
  );
  if (data.status === "error") throw new Error(`Twelve Data: ${data.message}`);
  return data.values.map((v: Record<string, string>) => ({
    t: Date.parse(v.datetime.replace(" ", "T") + "Z"),
    o: +v.open,
    h: +v.high,
    l: +v.low,
    c: +v.close,
  }));
}

// Kichik shamlarni vaqt chegarasi bo'yicha katta taymfreymga yig'adi (masalan 12 × M5 = H1, soat boshidan).
export function bucketByTime(candles: Candle[], minutes: number): Candle[] {
  const ms = minutes * 60_000;
  const out: Candle[] = [];
  for (const c of candles) {
    const t = Math.floor(c.t / ms) * ms;
    const last = out[out.length - 1];
    if (last && last.t === t) {
      last.h = Math.max(last.h, c.h);
      last.l = Math.min(last.l, c.l);
      last.c = c.c;
    } else out.push({ t, o: c.o, h: c.h, l: c.l, c: c.c });
  }
  return out;
}

// Shamlarni n tadan guruhlab kattaroq taymfreym yasaydi (masalan 4 × H1 = H4).
export function aggregate(candles: Candle[], n: number): Candle[] {
  const out: Candle[] = [];
  for (let i = candles.length % n; i + n <= candles.length; i += n) {
    const g = candles.slice(i, i + n);
    out.push({ t: g[0].t, o: g[0].o, h: Math.max(...g.map((c) => c.h)), l: Math.min(...g.map((c) => c.l)), c: g[n - 1].c });
  }
  return out;
}

// Demo rejim (DEMO_DATA=1): internetga chiqmasdan sun'iy narxlar bilan ishlaydi.
const DEMO_BASE: Record<string, number> = {
  BTCUSDT: 62000, ETHUSDT: 2450, SOLUSDT: 145, BNBUSDT: 580, XRPUSDT: 0.53,
  "GC=F": 2660, "XAU/USD": 2660, "EURUSD=X": 1.095, "EUR/USD": 1.095, "GBPUSD=X": 1.31, "GBP/USD": 1.31,
  "JPY=X": 149.3, "USD/JPY": 149.3, "AUDUSD=X": 0.674, "AUD/USD": 0.674, "CHF=X": 0.858, "USD/CHF": 0.858,
  "CAD=X": 1.372, "USD/CAD": 1.372,
};
function demo(symbol: string, minutes: number, limit = LIMIT): Candle[] {
  let seed = [...symbol + minutes].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
  const base = DEMO_BASE[symbol] ?? 100;
  const step = minutes * 60_000;
  const end = Math.floor(Date.now() / step) * step;
  let p = base;
  const drift = (rnd() - 0.5) * 0.002;
  return Array.from({ length: limit }, (_, i) => {
    const o = p;
    p = p * (1 + drift * Math.sin(i / 25) + (rnd() - 0.5) * 0.004);
    const h = Math.max(o, p) * (1 + rnd() * 0.0015);
    const l = Math.min(o, p) * (1 - rnd() * 0.0015);
    return { t: end - (limit - i) * step, o, h, l, c: p };
  });
}

// M1 shamlari (yangilik reaksiyasi tahlili uchun): keshsiz, chunki har daqiqa muhim. Twelve Data'da bitta so'rov.
export async function getM1(inst: Instrument, limit = 120): Promise<Candle[]> {
  if (process.env.DEMO_DATA === "1") return demo(inst.symbol, 1, limit);
  let raw: Candle[];
  if (inst.source === "binance") {
    const rows: unknown[][] = await getJson(`https://data-api.binance.vision/api/v3/klines?symbol=${inst.symbol}&interval=1m&limit=${limit}`, {}, 0);
    raw = rows.map((r) => ({ t: Number(r[0]), o: +String(r[1]), h: +String(r[2]), l: +String(r[3]), c: +String(r[4]), v: +String(r[5]) }));
  } else if (inst.source === "twelvedata") {
    const data = await getJson(
      `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(inst.symbol)}&interval=1min&outputsize=${limit}&order=asc&timezone=UTC&apikey=${process.env.TWELVEDATA_API_KEY}`,
      {}, 0,
    );
    if (data.status === "error") throw new Error(`Twelve Data: ${data.message}`);
    raw = data.values.map((v: Record<string, string>) => ({ t: Date.parse(v.datetime.replace(" ", "T") + "Z"), o: +v.open, h: +v.high, l: +v.low, c: +v.close, ...(v.volume ? { v: +v.volume } : {}) }));
  } else {
    const data = await getJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(inst.symbol)}?interval=1m&range=1d`,
      { headers: { "User-Agent": "Mozilla/5.0 (signal-desk)" } }, 0,
    );
    const r = data?.chart?.result?.[0];
    if (!r) throw new Error("Yahoo: ma'lumot yo'q");
    const q = r.indicators.quote[0];
    raw = [];
    r.timestamp.forEach((ts: number, i: number) => {
      if ([q.open[i], q.high[i], q.low[i], q.close[i]].some((v) => v == null)) return;
      raw.push({ t: ts * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], ...(q.volume?.[i] ? { v: q.volume[i] } : {}) });
    });
  }
  return closedOnly(raw, 1).slice(-limit);
}

// limit: kerakli sham soni (standart 200). Oltin pips rejimi kun boshidan kuzatish uchun ko'proq oladi.
export async function getCandles(inst: Instrument, minutes: number, limit = LIMIT): Promise<Candle[]> {
  if (process.env.DEMO_DATA === "1") return demo(inst.symbol, minutes, limit);
  const raw =
    inst.source === "binance"
      ? await binance(inst.symbol, minutes, limit)
      : inst.source === "twelvedata"
        ? await twelvedata(inst.symbol, minutes, limit)
        : await yahoo(inst.symbol, minutes, limit);
  return closedOnly(raw, minutes);
}

// Jonli narx (admin "Jonli savdolar"): shakllanayotgan oxirgi M5 sham bilan. So'rov manzili getCandles(inst, 5) bilan bir xil,
// shuning uchun cron bilan bitta keshni bo'lishadi (Twelve Data kunlik limiti tejaladi).
export async function getLastPrice(inst: Instrument): Promise<{ price: number; t: number } | null> {
  const raw = process.env.DEMO_DATA === "1" ? demo(inst.symbol, 5, 3)
    : inst.source === "binance" ? await binance(inst.symbol, 5, 3)
    : inst.source === "twelvedata" ? await twelvedata(inst.symbol, 5, 3)
    : await yahoo(inst.symbol, 5, 3);
  const last = raw.at(-1);
  return last ? { price: last.c, t: last.t } : null;
}

export function minutesOf(tf: Timeframe) {
  return MINUTES[tf];
}

// Har bir taymfreym uchun tasdiq beruvchi yuqori taymfreym (daqiqalarda).
export const HIGHER: Record<Timeframe, number> = { M5: 15, M15: 60, M30: 60, H1: 240 };

// ---- Katta taymfreymlar (kunlik, haftalik, oylik): bozor manzarasi uchun, 1 soat keshlanadi.
const CTX: Record<Exclude<ContextTf, "H4">, { binance: string; yahoo: [string, string]; twelve: string; minutes: number }> = {
  D1: { binance: "1d", yahoo: ["1d", "1y"], twelve: "1day", minutes: 1440 },
  W1: { binance: "1w", yahoo: ["1wk", "5y"], twelve: "1week", minutes: 10080 },
  MN: { binance: "1M", yahoo: ["1mo", "10y"], twelve: "1month", minutes: 43200 },
};
const ctxCache = new Map<string, { at: number; p: Promise<Candle[]> }>();

// H4 manzarasi: Yahoo 4 soatlik bermaydi, shuning uchun 3 oylik H1 dan yig'iladi (60 dan ortiq H4 sham kerak).
export async function getH4Context(inst: Instrument): Promise<Candle[]> {
  if (process.env.DEMO_DATA === "1" || inst.source !== "yahoo") return getCandles(inst, 240);
  return closedOnly(aggregate(await yahoo(inst.symbol, 60, 2000), 4), 240);
}

export function getContextCandles(inst: Instrument, tf: Exclude<ContextTf, "H4">): Promise<Candle[]> {
  const key = `${inst.symbol}|${tf}`;
  const hit = ctxCache.get(key);
  if (hit && Date.now() - hit.at < 3600_000) return hit.p;
  const p = fetchContext(inst, tf);
  ctxCache.set(key, { at: Date.now(), p });
  p.catch(() => ctxCache.delete(key));
  return p;
}

async function fetchContext(inst: Instrument, tf: Exclude<ContextTf, "H4">): Promise<Candle[]> {
  const c = CTX[tf];
  let raw: Candle[];
  if (process.env.DEMO_DATA === "1") raw = demo(inst.symbol, c.minutes);
  else if (inst.source === "binance") {
    const rows: unknown[][] = await getJson(`https://data-api.binance.vision/api/v3/klines?symbol=${inst.symbol}&interval=${c.binance}&limit=${LIMIT}`);
    raw = rows.map((r) => ({ t: Number(r[0]), o: +String(r[1]), h: +String(r[2]), l: +String(r[3]), c: +String(r[4]) }));
  } else if (inst.source === "twelvedata") {
    const data = await getJson(
      `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(inst.symbol)}&interval=${c.twelve}&outputsize=${LIMIT}&order=asc&timezone=UTC&apikey=${process.env.TWELVEDATA_API_KEY}`,
    );
    if (data.status === "error") throw new Error(`Twelve Data: ${data.message}`);
    raw = data.values.map((v: Record<string, string>) => ({ t: Date.parse(v.datetime.slice(0, 10) + "T00:00:00Z"), o: +v.open, h: +v.high, l: +v.low, c: +v.close }));
  } else {
    const data = await getJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(inst.symbol)}?interval=${c.yahoo[0]}&range=${c.yahoo[1]}`,
      { headers: { "User-Agent": "Mozilla/5.0 (signal-desk)" } },
    );
    const r = data?.chart?.result?.[0];
    if (!r) throw new Error("Yahoo: ma'lumot yo'q");
    const q = r.indicators.quote[0];
    raw = [];
    r.timestamp.forEach((ts: number, i: number) => {
      if ([q.open[i], q.high[i], q.low[i], q.close[i]].some((v) => v == null)) return;
      raw.push({ t: ts * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i] });
    });
  }
  // Oxirgi sham hali shakllanmoqda: trend faqat yopilgan shamlardan hisoblanadi.
  return raw.slice(0, -1);
}
