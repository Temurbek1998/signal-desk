// Iqtisodiy kalendar: Forex Factory haftalik kalendari (bepul, kalitsiz).
// Manba soatiga bir necha so'rovdan ko'pini yoqtirmaydi, shuning uchun natija 30 daqiqa keshlanadi.

const CALENDAR_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json";
const REVALIDATE = 1800;

export type Impact = "High" | "Medium" | "Low" | "Holiday";

export type NewsEvent = {
  title: string;
  currency: string; // USD, EUR, ...
  time: number; // ms
  impact: Impact;
  forecast: string;
  previous: string;
  pairs: string[]; // ta'sir qiladigan juftliklar
};

type RawEvent = { title: string; country: string; date: string; impact: string; forecast?: string; previous?: string };

// Har bir valyuta yangiligi qaysi juftliklarga ta'sir qiladi. USD yangiliklari oltinga ham ta'sir qiladi.
const PAIRS_BY_CURRENCY: Record<string, string[]> = {
  USD: ["XAU/USD", "EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CHF", "USD/CAD"],
  EUR: ["EUR/USD"],
  GBP: ["GBP/USD"],
  JPY: ["USD/JPY"],
  AUD: ["AUD/USD"],
  CHF: ["USD/CHF"],
  CAD: ["USD/CAD"],
  CNY: ["XAU/USD", "AUD/USD"],
};

// Mashhur yangiliklar uchun o'zbekcha izoh.
const KNOWN: [RegExp, string][] = [
  [/non-farm/i, "NFP: AQSh qishloq xo'jaligidan tashqari ish o'rinlari"],
  [/cpi/i, "CPI: inflyatsiya"],
  [/federal funds rate|fomc/i, "FOMC: AQSh foiz stavkasi"],
  [/interest rate|rate decision|cash rate|bank rate|main refinancing/i, "Markaziy bank foiz stavkasi"],
  [/unemployment/i, "Ishsizlik darajasi"],
  [/gdp/i, "YaIM (GDP)"],
  [/retail sales/i, "Chakana savdo"],
  [/pmi/i, "PMI: biznes faolligi indeksi"],
  [/press conference|speaks/i, "Markaziy bank rahbari nutqi"],
];

export function describe(title: string): string | null {
  return KNOWN.find(([re]) => re.test(title))?.[1] ?? null;
}

export function parseCalendar(raw: RawEvent[]): NewsEvent[] {
  return raw
    .filter((e) => PAIRS_BY_CURRENCY[e.country])
    .map((e) => ({
      title: e.title,
      currency: e.country,
      time: Date.parse(e.date),
      impact: e.impact as Impact,
      forecast: e.forecast ?? "",
      previous: e.previous ?? "",
      pairs: PAIRS_BY_CURRENCY[e.country],
    }))
    .filter((e) => !Number.isNaN(e.time))
    .sort((a, b) => a.time - b.time);
}

export async function getCalendar(): Promise<NewsEvent[]> {
  if (process.env.DEMO_DATA === "1") return demoCalendar();
  const res = await fetch(CALENDAR_URL, { next: { revalidate: REVALIDATE } } as RequestInit);
  if (!res.ok) throw new Error(`Kalendar ${res.status}`);
  return parseCalendar(await res.json());
}

// Yangilikdan oldin va keyin shu oraliqda signallar "yangilik xavfi" bilan belgilanadi.
export const RISK_BEFORE_MS = 60 * 60_000;
export const RISK_AFTER_MS = 30 * 60_000;

export function riskFor(pair: string, events: NewsEvent[], now = Date.now()): NewsEvent | null {
  return (
    events.find(
      (e) => e.impact === "High" && e.pairs.includes(pair) && e.time - RISK_BEFORE_MS <= now && now <= e.time + RISK_AFTER_MS,
    ) ?? null
  );
}

function demoCalendar(): NewsEvent[] {
  const now = Date.now();
  const at = (min: number) => Math.round((now + min * 60_000) / 300_000) * 300_000;
  return parseCalendar([
    { title: "Average Hourly Earnings m/m", country: "USD", date: new Date(at(-10)).toISOString(), impact: "High", forecast: "0.3%", previous: "0.4%" },
    { title: "Non-Farm Employment Change", country: "USD", date: new Date(at(40)).toISOString(), impact: "High", forecast: "140K", previous: "142K" },
    { title: "Unemployment Rate", country: "USD", date: new Date(at(40)).toISOString(), impact: "High", forecast: "4.2%", previous: "4.2%" },
    { title: "ECB President Lagarde Speaks", country: "EUR", date: new Date(at(190)).toISOString(), impact: "High" },
    { title: "BOJ Policy Rate", country: "JPY", date: new Date(at(600)).toISOString(), impact: "High", forecast: "0.50%", previous: "0.50%" },
    { title: "German Factory Orders m/m", country: "EUR", date: new Date(at(300)).toISOString(), impact: "Medium", forecast: "0.4%", previous: "-0.2%" },
  ]);
}
