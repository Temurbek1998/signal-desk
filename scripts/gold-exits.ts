// Oltin M15: kirishlar o'zgarmaydi, faqat chiqish qoidalari sinaladi (SL, TP1 ulushi, TP2, trailing, vaqt bo'yicha yopish).
//
//   node --experimental-strip-types scripts/gold-exits.ts <paxg_15m.csv>
//
// Har variant butun davrda va ikki yarmida alohida (h1, h2). Xarajat: har tomonga 0.01%.
// Bitta shamda SL va TP birga bo'lsa, ehtiyot uchun SL birinchi deb olinadi.

import { readFileSync } from "node:fs";
import { analyze, generateSignal, DEFAULT_RULES, SL_ATR_BY_CATEGORY } from "../src/lib/engine.ts";
import { marketOpen } from "../src/lib/sessions.ts";
import type { Candle } from "../src/lib/types.ts";
import { bucket } from "./backtest.ts";

const FEE = 0.0001;
const WINDOW = 200;

export type Exit = {
  sl: number;          // SL, ATR baravarida
  tp1: number;         // TP1, R da
  part: number;        // TP1 da yopiladigan ulush (0..1)
  tp2: number | null;  // qolgan qism uchun TP2, R da (null = faqat trailing yoki vaqt)
  after: "be" | "keep" | number; // TP1 dan keyin SL: kirishga, joyida, yoki shuncha ATR orqadan trailing
  maxBars: number | null; // shuncha shamdan keyin bozor narxida yopish
};

type Entry = { n: number; dir: 1 | -1; entry: number; atr: number };

function entries(m15: Candle[], h1: Candle[]): Entry[] {
  const out: Entry[] = [];
  let h = 0;
  for (let n = 60; n < m15.length - 1; n++) {
    const close = m15[n].t + 15 * 60_000;
    while (h < h1.length && h1[h].t + 60 * 60_000 <= close) h++;
    const ha = analyze(h1.slice(Math.max(0, h - WINDOW), h));
    const win = m15.slice(Math.max(0, n + 1 - WINDOW), n + 1);
    const s = generateSignal("XAU/USD", "gold", "M15", win, ha, DEFAULT_RULES);
    if (!s?.side) continue;
    const a = analyze(win)!;
    out.push({ n, dir: s.side === "BUY" ? 1 : -1, entry: s.entry, atr: a.atr });
  }
  return out;
}

// Bitta savdo natijasi R da (xarajat bilan) va chiqish shami.
function run(c: Candle[], e: Entry, x: Exit): { r: number; end: number } | null {
  const risk = e.atr * x.sl, d = e.dir;
  let sl = e.entry - d * risk;
  const tp1 = e.entry + d * risk * x.tp1;
  const tp2 = x.tp2 == null ? null : e.entry + d * risk * x.tp2;
  let open = 1, r = 0, hit1 = false, best = e.entry;
  const fee = (2 * FEE * e.entry) / risk;
  for (let j = e.n + 1; j < c.length; j++) {
    const k = c[j];
    const lo = d > 0 ? k.l : k.h, hi = d > 0 ? k.h : k.l;
    if ((lo - sl) * d <= 0) return { r: r + open * ((sl - e.entry) * d) / risk - fee, end: j };
    if (!hit1 && (hi - tp1) * d >= 0) {
      hit1 = true;
      r += x.part * x.tp1; open -= x.part;
      if (open <= 1e-9) return { r: r - fee, end: j };
      if (x.after === "be") sl = e.entry;
    }
    if (hit1 && tp2 != null && (hi - tp2) * d >= 0) return { r: r + open * x.tp2! - fee, end: j };
    if (d > 0 ? k.h > best : k.l < best) best = d > 0 ? k.h : k.l;
    if (hit1 && typeof x.after === "number") {
      const trail = best - d * x.after * e.atr;
      if ((trail - sl) * d > 0) sl = trail;
    }
    if (x.maxBars != null && j - e.n >= x.maxBars) return { r: r + open * ((k.c - e.entry) * d) / risk - fee, end: j };
  }
  return null;
}

export function test(c: Candle[], es: Entry[], x: Exit) {
  const rs: number[] = [];
  let busy = -1;
  for (const e of es) {
    if (e.n <= busy) continue;
    const t = run(c, e, x);
    if (!t) break;
    rs.push(t.r); busy = t.end;
  }
  const n = rs.length, sum = rs.reduce((a, b) => a + b, 0);
  const wins = rs.filter((r) => r > 0), losses = rs.filter((r) => r < 0);
  return {
    n, avg: n ? sum / n : 0, sum, win: n ? wins.length / n : 0,
    avgWin: wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0,
    avgLoss: losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0,
    pf: losses.length ? wins.reduce((a, b) => a + b, 0) / -losses.reduce((a, b) => a + b, 0) : Infinity,
    dd: (() => { let p = 0, m = 0, dd = 0; for (const r of rs) { p += r; m = Math.max(m, p); dd = Math.max(dd, m - p); } return dd; })(),
  };
}

export function grid(): Exit[] {
  const out: Exit[] = [];
  for (const sl of [1.5, 2, 2.5, 3])
    for (const tp1 of [0.5, 0.75, 1])
      for (const part of [0.5, 0.33, 0])
        for (const tp2 of [1.5, 2, 3, null] as (number | null)[])
          for (const after of ["be", "keep", 1, 1.5, 2] as Exit["after"][])
            for (const maxBars of [null, 32, 96]) {
              if (part === 0 && after !== "keep" && typeof after !== "number" && after !== "be") continue;
              if (tp2 == null && typeof after !== "number" && maxBars == null) continue;
              if (tp2 != null && tp2 <= tp1) continue;
              out.push({ sl, tp1, part, tp2, after, maxBars });
            }
  return out;
}

export const label = (x: Exit) => `SL ${x.sl}ATR | TP1 ${x.tp1}R x${x.part} | TP2 ${x.tp2 ?? "—"} | keyin ${typeof x.after === "number" ? `trail ${x.after}ATR` : x.after} | ${x.maxBars ? `${x.maxBars / 4}s` : "∞"}`;

if (import.meta.url === `file://${process.argv[1]}`) {
  const raw = readFileSync(process.argv[2], "utf8").trim().split("\n").slice(1).map((l) => {
    const [t, o, h, lo, c] = l.split(",").map(Number);
    return { t, o, h, l: lo, c };
  }).filter((c) => marketOpen("gold", c.t));
  const m15 = bucket(raw, 15), h1 = bucket(raw, 60);
  const es = entries(m15, h1);
  const halfT = m15[m15.length >> 1].t;
  const cut = es.findIndex((e) => m15[e.n].t >= halfT);
  const days = (m15.at(-1)!.t - m15[0].t) / 86_400_000;
  console.error(`# ${m15.length} M15 sham, ${days.toFixed(0)} kun, ${es.length} kirish nuqtasi (1-yarim ${cut})`);
  const base: Exit = { sl: SL_ATR_BY_CATEGORY.gold, tp1: 0.5, part: 0.5, tp2: 1.5, after: "be", maxBars: null };
  const rows = grid().map((x) => ({ x, f: test(m15, es, x), a: test(m15, es.slice(0, cut), x), b: test(m15, es.slice(cut), x) }));
  const fmt = (r: (typeof rows)[0]) => `${label(r.x)}\t${r.f.n}\t${(r.f.win * 100).toFixed(0)}%\t${r.f.avgWin.toFixed(2)}/${r.f.avgLoss.toFixed(2)}\t${r.f.avg.toFixed(3)}\t${r.f.sum.toFixed(1)}\t${r.f.pf.toFixed(2)}\t${r.f.dd.toFixed(1)}\t${r.a.avg.toFixed(3)} (${r.a.n})\t${r.b.avg.toFixed(3)} (${r.b.n})`;
  console.log("variant\tsavdo\twin\to'rt.yutuq/zarar R\to'rt.R\tjami R\tPF\tmaks.pasayish R\th1\th2");
  console.log("JORIY: " + fmt({ x: base, f: test(m15, es, base), a: test(m15, es.slice(0, cut), base), b: test(m15, es.slice(cut), base) }));
  const robust = rows.filter((r) => r.a.avg > 0 && r.b.avg > 0 && r.f.n >= 25).sort((p, q) => Math.min(q.a.avg, q.b.avg) - Math.min(p.a.avg, p.b.avg));
  console.log(`# ikkala yarmida ham musbat: ${robust.length} / ${rows.length}`);
  for (const r of robust.slice(0, 25)) console.log(fmt(r));
}
