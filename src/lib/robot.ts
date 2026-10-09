import { analyze, latestSignal, quality } from "./engine.ts";
import { activeInstruments, ALL_INSTRUMENTS } from "./instruments.ts";
import { marketOpen } from "./sessions.ts";
import { pipsSignals } from "./pips.ts";
import { scalpSignals } from "./scalp.ts";
import { getCalendar, riskFor, type NewsEvent } from "./news.ts";
import { aggregate, getCandles, getContextCandles, getH4Context, HIGHER, minutesOf } from "./market.ts";
import { CONTEXT_TFS, type ContextTf, type Instrument, type MarketContext, type Signal, type Timeframe } from "./types.ts";

async function higherCandles(inst: Instrument, minutes: number) {
  // Yahoo 4 soatlik sham bermaydi: H1 shamlardan yig'amiz.
  if (minutes === 240 && inst.source === "yahoo") return aggregate(await getCandles(inst, 60), 4);
  return getCandles(inst, minutes);
}

// Bozor manzarasi: H4, kunlik, haftalik va oylik trend. Oltin sinovida (GOLD_BACKTEST.md) katta trendga
// qarshi signallar ham yaxshi natija bergan, shuning uchun bu filtr emas: faqat admin va mijozga ma'lumot.
export async function marketContext(inst: Instrument): Promise<MarketContext> {
  const out: MarketContext = {};
  await Promise.all(CONTEXT_TFS.map(async (k: ContextTf) => {
    try {
      const c = k === "H4" ? await getH4Context(inst) : await getContextCandles(inst, k);
      const a = analyze(c);
      if (a) out[k] = a.trend;
    } catch {
      // manba javob bermasa shu taymfreym ko'rsatilmaydi
    }
  }));
  return out;
}

const ARROW = { up: "↑", down: "↓", flat: "→" } as const;
export const contextText = (c: MarketContext) => CONTEXT_TFS.filter((k) => c[k]).map((k) => `${k} ${ARROW[c[k]!]}`).join(", ");

// keepPairs: o'chirilgan bozorlardagi ochiq savdolar yopilguncha kuzatilishi uchun (yangi savdo ochilmaydi, track.ts).
export async function runRobot(tf: Timeframe, keepPairs: string[] = []) {
  const errors: { pair: string; message: string }[] = [];
  // Kalendar ishlamasa ham robot signal berishda davom etadi.
  const calendar: NewsEvent[] = await getCalendar().catch(() => []);
  const results = await Promise.all(
    // Bozor yopiq bo'lsa (dam olish kunlari, kunlik tanaffus) robot bu juftlikni tahlil qilmaydi va savdoga kirmaydi.
    [...activeInstruments(), ...ALL_INSTRUMENTS.filter((i) => keepPairs.includes(i.pair) && !activeInstruments().some((a) => a.pair === i.pair))]
      .filter((i) => marketOpen(i.category)).map(async (inst): Promise<Signal[]> => {
      try {
        // Oltin M15: pips rejimi uchun kun boshidan kuzatish kerak, shuning uchun ko'proq sham olinadi.
        const pips = inst.category === "gold" && tf === "M15";
        const scalp = inst.category === "gold" && tf === "M5"; // Gerakl'ga ham kun boshidan kuzatish kerak
        const [all, higher, context] = await Promise.all([
          getCandles(inst, minutesOf(tf), pips || scalp ? 400 : undefined),
          higherCandles(inst, HIGHER[tf]).catch(() => []),
          marketContext(inst),
        ]);
        const candles = all.slice(-200);
        const s = latestSignal(inst.pair, inst.category, tf, candles, analyze(higher));
        const news = riskFor(inst.pair, calendar);
        const newsRisk = news && { title: news.title, currency: news.currency, time: news.time };
        const withContext = (x: Signal): Signal => ({
          ...x,
          newsRisk,
          context,
          reasons: Object.keys(context).length ? [...x.reasons, `Katta trend: ${contextText(context)}`] : x.reasons,
        });
        const out = s ? [withContext({ ...s, strategy: "trend", quality: quality(s, !!news) })] : [];
        // Pips rejimi trend signallariga qo'shimcha (Bek qarori: "Ikkalasi birga"). Yangilik filtri yo'q: tarixiy sinov ham filtrsiz.
        if (pips) out.push(...pipsSignals(inst.pair, all).map(withContext));
        // Gerakl: skalping/razgon roboti (M5). Bek talabi: alohida robot, Zeus bilan birga ishlaydi.
        if (scalp) out.push(...scalpSignals(inst.pair, all).map(withContext));
        return out;
      } catch (e) {
        errors.push({ pair: inst.pair, message: e instanceof Error ? e.message : String(e) });
        return [];
      }
    }),
  );
  return {
    timeframe: tf,
    generatedAt: Date.now(),
    signals: results.flat(),
    errors,
  };
}
