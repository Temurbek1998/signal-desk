// Oltin: M15 signallarini katta taymfreym (H4, D1, W1, MN) trendi bilan solishtirish.
// Ishlatish: node --experimental-strip-types scripts/htf-context.ts <paxg_15m.csv> <htf papka: paxg_1d.csv, paxg_1w.csv, paxg_1M.csv>
import { readFileSync } from "node:fs";
import { bucket, simulate, summarize, type Trade, type Variant } from "./backtest.ts";
import { analyze, DEFAULT_RULES } from "../src/lib/engine.ts";
import { marketOpen } from "../src/lib/sessions.ts";
import type { Candle } from "../src/lib/types.ts";

const FEE = 0.01;
const read = (p: string): Candle[] => readFileSync(p, "utf8").trim().split("\n").slice(1).map((l) => {
  const [t, o, h, lo, c] = l.split(",").map(Number);
  return { t, o, h, l: lo, c, v: 0 };
});
const DAY = 864e5;
const raw = read(process.argv[2]);
const dir = process.argv[3];

// Kunlik va haftalik: yuklab olingan tarix + 15 daqiqalikdan yig'ilgan davomi.
function extend(hist: Candle[], fromM15: Candle[]): Candle[] {
  const last = hist.at(-1)!.t;
  return [...hist, ...fromM15.filter((c) => c.t > last)];
}
const weekStart = (t: number) => { const d = Math.floor(t / DAY); return (d - ((d + 3) % 7)) * DAY; }; // dushanba 00:00 UTC
function byKey(c: Candle[], key: (t: number) => number): Candle[] {
  const out: Candle[] = [];
  for (const x of c) {
    const t = key(x.t), last = out.at(-1);
    if (last && last.t === t) { last.h = Math.max(last.h, x.h); last.l = Math.min(last.l, x.l); last.c = x.c; }
    else out.push({ ...x, t });
  }
  return out;
}
const d1 = extend(read(`${dir}/paxg_1d.csv`), byKey(raw, (t) => Math.floor(t / DAY) * DAY));
const w1 = extend(read(`${dir}/paxg_1w.csv`), byKey(raw, weekStart));
const mn = read(`${dir}/paxg_1M.csv`);
const SPAN: Record<string, (t: number) => number> = {
  D1: (t) => t + DAY, W1: (t) => t + 7 * DAY,
  MN: (t) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); },
};

// Sanity: 15m dan yig'ilgan hafta yuklangan haftaga mos keladimi
const wk = byKey(raw, weekStart), chk = read(`${dir}/paxg_1w.csv`).filter((w) => wk.some((x) => x.t === w.t));
for (const w of chk.slice(1, 4)) { const x = wk.find((y) => y.t === w.t)!; console.log(`# tekshiruv hafta ${new Date(w.t).toISOString().slice(0, 10)}: yuklangan c=${w.c}, 15m dan c=${x.c}, h ${w.h}/${x.h}`); }

const m15 = raw.filter((c) => marketOpen("gold", c.t));
const h4 = bucket(m15, 240);
const series: Record<string, Candle[]> = { H4: h4, D1: d1, W1: w1, MN: mn };
const spanOf = (k: string, t: number) => (k === "H4" ? t + 4 * 36e5 : SPAN[k](t));

function trendAt(k: string, at: number): "up" | "down" | "flat" {
  const s = series[k];
  let i = 0;
  while (i < s.length && spanOf(k, s[i].t) <= at) i++; // faqat yopilgan shamlar
  return analyze(s.slice(Math.max(0, i - 300), i))?.trend ?? "flat";
}

const v: Variant = { name: "joriy", slMult: 2.5, tp1R: 0.5, tp2R: 1.5, minConf: 0, category: "gold", rules: DEFAULT_RULES };
const trades = simulate(bucket(m15, 15), bucket(m15, 60), 15, 60, v);
type T = Trade & { ctx: Record<string, string> };
const tagged: T[] = trades.map((t) => ({ ...t, ctx: Object.fromEntries(["H4", "D1", "W1", "MN"].map((k) => {
  const tr = trendAt(k, t.at), want = t.side === "BUY" ? "up" : "down";
  return [k, tr === "flat" ? "flat" : tr === want ? "mos" : "qarshi"];
})) }));

const row = (name: string, list: T[]) => {
  const s = summarize(list, FEE);
  console.log(`${name}\t${s.trades}\t${s.trades ? (s.winRate * 100).toFixed(0) + "%" : "-"}\t${s.trades ? s.avgR.toFixed(3) : "-"}\t${s.trades ? s.profitFactor.toFixed(2) : "-"}`);
};
console.log(`# ${trades.length} ta M15 savdo, ${new Date(m15[0].t).toISOString().slice(0, 10)} — ${new Date(m15.at(-1)!.t).toISOString().slice(0, 10)}`);
console.log("guruh\tsavdo\twin\tnetR\tPF");
row("hammasi", tagged);
for (const k of ["H4", "D1", "W1", "MN"]) for (const g of ["mos", "flat", "qarshi"]) row(`${k} ${g}`, tagged.filter((t) => t.ctx[k] === g));
const score = (t: T) => ["H4", "D1", "W1", "MN"].reduce((a, k) => a + (t.ctx[k] === "mos" ? 1 : t.ctx[k] === "qarshi" ? -1 : 0), 0);
for (const m of [-4, -2, 0, 1, 2, 3, 4]) row(`ball >= ${m}`, tagged.filter((t) => score(t) >= m));
row("D1 qarshi emas", tagged.filter((t) => t.ctx.D1 !== "qarshi"));
row("D1 va W1 qarshi emas", tagged.filter((t) => t.ctx.D1 !== "qarshi" && t.ctx.W1 !== "qarshi"));

console.log("\n# Oylik natija (joriy robot)");
const months = [...new Set(tagged.map((t) => new Date(t.at).toISOString().slice(0, 7)))];
for (const mo of months) row(mo, tagged.filter((t) => new Date(t.at).toISOString().slice(0, 7) === mo));
console.log("\n# Haftalik natija");
const weeks = [...new Set(tagged.map((t) => weekStart(t.at)))];
for (const w of weeks) row(new Date(w).toISOString().slice(0, 10), tagged.filter((t) => weekStart(t.at) === w));
console.log("\n# Savdolar");
for (const t of tagged) console.log(`${new Date(t.at).toISOString().slice(0, 16)}\t${t.side}\t${t.r.toFixed(2)}R\tH4 ${t.ctx.H4}\tD1 ${t.ctx.D1}\tW1 ${t.ctx.W1}\tMN ${t.ctx.MN}`);
console.log("\n# Hozirgi trend: " + ["H4", "D1", "W1", "MN"].map((k) => `${k} ${trendAt(k, Date.now())}`).join(", "));
