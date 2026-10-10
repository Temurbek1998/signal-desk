// Keskin harakat (egasining talabi, 2026-10-10): yangilikdan qat'i nazar, M1 da 2-3 daqiqa ichida katta harakat
// (oltinda standart 180 pips = 18 $). Sof funksiyalar: topish va keyin qancha yurganini o'lchash. Server: server/spikeWatch.ts.
import { toPips } from "./aiTrade.ts";
import type { Candle } from "./types.ts";

export type Spike = { side: "BUY" | "SELL"; bars: number; movePips: number; peakPips: number; from: number; price: number; t: number };

const r1 = (x: number) => Math.round(x * 10) / 10;

// Oxirgi 2 yoki 3 yopilgan M1 sham: birinchisining ochilishidan oxirgisining yopilishigacha kamida minPips.
// Yopilish bo'yicha (bitta soyali sakrash hisoblanmaydi); peakPips: shu oraliqdagi eng chekka nuqta.
// lookback: oxirgi nechta shamda tugagan oynalar tekshiriladi (har daqiqada 1, har 5 daqiqada chaqirilsa 5), eng yangisi qaytadi.
export function detectSpike(pair: string, m1: Candle[], minPips: number, lookback = 1): Spike | null {
  for (let end = m1.length; end > Math.max(0, m1.length - lookback); end--) {
    for (const n of [2, 3]) {
      const g = m1.slice(end - n, end);
      if (g.length < n || end - n < 0) continue;
      const move = g.at(-1)!.c - g[0].o;
      const pips = Math.abs(toPips(pair, move));
      if (pips < minPips) continue;
      const dir = move > 0 ? 1 : -1;
      const peak = dir > 0 ? Math.max(...g.map((c) => c.h)) - g[0].o : g[0].o - Math.min(...g.map((c) => c.l));
      return { side: dir > 0 ? "BUY" : "SELL", bars: n, movePips: r1(pips), peakPips: r1(toPips(pair, peak)), from: g[0].o, price: g.at(-1)!.c, t: g.at(-1)!.t };
    }
  }
  return null;
}

export type SpikeFollow = { minutes: number; mfePips: number; maePips: number; after5: number | null; after15: number | null; after30: number | null; after60: number | null };

// Harakatdan keyin (shu sham yopilgandan so'ng) narx qancha yurdi: shu yo'nalishda eng uzoq (mfe), teskari (mae)
// va 5/15/30/60 daqiqadan keyingi holat, hammasi harakat oxiridagi narxdan pips da.
export function followSpike(pair: string, side: "BUY" | "SELL", price: number, spikeT: number, m1: Candle[]): SpikeFollow {
  const dir = side === "BUY" ? 1 : -1;
  const after = m1.filter((c) => c.t > spikeT && c.t <= spikeT + 60 * 60_000);
  let mfe = 0, mae = 0;
  for (const c of after) {
    mfe = Math.max(mfe, toPips(pair, (dir > 0 ? c.h - price : price - c.l)));
    mae = Math.max(mae, toPips(pair, (dir > 0 ? price - c.l : c.h - price)));
  }
  const at = (m: number) => {
    const c = after.find((x) => x.t >= spikeT + m * 60_000);
    return c ? r1(toPips(pair, (c.c - price) * dir)) : null;
  };
  return { minutes: after.length, mfePips: r1(mfe), maePips: r1(mae), after5: at(5), after15: at(15), after30: at(30), after60: at(60) };
}
