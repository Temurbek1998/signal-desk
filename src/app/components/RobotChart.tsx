"use client";
import { useEffect, useMemo, useRef, useState } from "react";

// Robot tahlili grafigi: shamlar, EMA20/EMA50, robot signallari (kirish, TP, SL) va vaqt o'qi.
// Vaqt foydalanuvchi qurilmasining soat mintaqasida ko'rsatiladi.

export type ChartCandle = { t: number; o: number; h: number; l: number; c: number };
export type ChartSignal = { t: number; side: "BUY" | "SELL"; entry: number; tp1: number; tp2: number; sl: number; status: string; label: string };

const W = 1000, H = 440, PAD_L = 8, PAD_R = 78, PAD_T = 14, PLOT_H = 380;

export default function RobotChart({ candles, ema20, ema50, signals, digits, tfMinutes }: {
  candles: ChartCandle[]; ema20: number[]; ema50: number[]; signals: ChartSignal[]; digits: number; tfMinutes: number;
}) {
  const [local, setLocal] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => setLocal(true), []);

  const active = signals.filter((s) => s.status === "active");
  const { lo, hi } = useMemo(() => {
    let lo = Math.min(...candles.map((c) => c.l)), hi = Math.max(...candles.map((c) => c.h));
    for (const s of active) for (const v of [s.entry, s.tp1, s.tp2, s.sl]) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
    const pad = (hi - lo) * 0.06 || 1;
    return { lo: lo - pad, hi: hi + pad };
  }, [candles, active]);

  if (candles.length < 2) return <p className="muted">Grafik uchun ma'lumot yo'q.</p>;
  const n = candles.length;
  const step = (W - PAD_L - PAD_R) / n;
  const x = (i: number) => PAD_L + step * (i + 0.5);
  const y = (v: number) => PAD_T + ((hi - v) / (hi - lo)) * PLOT_H;
  const fmt = (v: number) => v.toFixed(digits);
  const time = (t: number, withDate = false) =>
    new Date(t).toLocaleString("ru-RU", { timeZone: local ? undefined : "UTC", hour: "2-digit", minute: "2-digit", ...(withDate ? { day: "2-digit", month: "2-digit" } : {}) });
  const idxOf = (t: number) => {
    const ms = tfMinutes * 60_000;
    const i = candles.findIndex((c) => t >= c.t && t < c.t + ms);
    return i >= 0 ? i : t < candles[0].t ? -1 : n - 1;
  };
  const line = (vals: number[]) => vals.map((v, i) => (Number.isFinite(v) ? `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}` : "")).join("");
  const ticks = Array.from({ length: 5 }, (_, k) => lo + ((hi - lo) * (k + 0.5)) / 5);
  const every = Math.max(1, Math.round(n / 6));
  const last = candles[n - 1];

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.floor((px - PAD_L) / step);
    setHover(i >= 0 && i < n ? i : null);
  };
  const hc = hover != null ? candles[hover] : null;

  return (
    <div className="chart-wrap">
      <div className="chart-info mono">
        {hc ? (
          <>
            <span>{time(hc.t, true)}</span>
            <span>O {fmt(hc.o)}</span><span>H {fmt(hc.h)}</span><span>L {fmt(hc.l)}</span>
            <span className={hc.c >= hc.o ? "up" : "down"}>C {fmt(hc.c)}</span>
            <span className="ema20">EMA20 {fmt(ema20[hover!])}</span><span className="ema50">EMA50 {fmt(ema50[hover!])}</span>
          </>
        ) : (
          <>
            <span>Oxirgi sham {time(last.t, true)}</span>
            <span className={last.c >= last.o ? "up" : "down"}>Narx {fmt(last.c)}</span>
            <span className="ema20">EMA20 {fmt(ema20[n - 1])}</span><span className="ema50">EMA50 {fmt(ema50[n - 1])}</span>
          </>
        )}
      </div>
      <div className="chart-scroll">
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className="robot-chart" role="img"
          aria-label={`Narx grafigi, oxirgi narx ${fmt(last.c)}`} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          {ticks.map((v) => (
            <g key={v}>
              <line className="grid" x1={PAD_L} x2={W - PAD_R} y1={y(v)} y2={y(v)} />
              <text className="ax" x={W - PAD_R + 6} y={y(v) + 4}>{fmt(v)}</text>
            </g>
          ))}
          {candles.map((c, i) => i % every === 0 && (
            <text key={c.t} className="ax" x={x(i)} y={PAD_T + PLOT_H + 22} textAnchor={i === 0 ? "start" : "middle"}>{time(c.t, i === 0 || new Date(c.t).getDate() !== new Date(candles[i - every]?.t ?? c.t).getDate())}</text>
          ))}
          {candles.map((c, i) => {
            const up = c.c >= c.o;
            const top = y(Math.max(c.o, c.c)), bot = y(Math.min(c.o, c.c));
            return (
              <g key={c.t} className={up ? "cu" : "cd"}>
                <line x1={x(i)} x2={x(i)} y1={y(c.h)} y2={y(c.l)} />
                <rect x={x(i) - step * 0.32} width={Math.max(1, step * 0.64)} y={top} height={Math.max(1, bot - top)} />
              </g>
            );
          })}
          <path className="ema20" d={line(ema20)} />
          <path className="ema50" d={line(ema50)} />

          {active.map((s) => {
            const i0 = Math.max(0, idxOf(s.t));
            const lv: [string, number, string][] = [["Kirish", s.entry, "lv-entry"], ["TP1", s.tp1, "lv-tp"], ["TP2", s.tp2, "lv-tp"], ["SL", s.sl, "lv-sl"]];
            return lv.map(([name, v, cls]) => (
              <g key={s.t + name} className={cls}>
                <line x1={x(i0)} x2={W - PAD_R} y1={y(v)} y2={y(v)} />
                <rect x={W - PAD_R + 2} y={y(v) - 9} width={PAD_R - 4} height={18} rx={4} />
                <text x={W - PAD_R + 6} y={y(v) + 4}>{name} {fmt(v)}</text>
              </g>
            ));
          })}

          {signals.map((s) => {
            const i = idxOf(s.t);
            if (i < 0) return null;
            const c = candles[i];
            const buy = s.side === "BUY";
            const py = buy ? y(c.l) + 14 : y(c.h) - 14;
            const d = buy ? `M${x(i)},${py - 8} l7,12 h-14 z` : `M${x(i)},${py + 8} l7,-12 h-14 z`;
            return (
              <g key={s.t + s.label} className={buy ? "mk-buy" : "mk-sell"}>
                <path d={d} />
                <text x={x(i)} y={buy ? py + 18 : py - 10} textAnchor="middle">{s.label}</text>
              </g>
            );
          })}

          <line className="last" x1={PAD_L} x2={W - PAD_R} y1={y(last.c)} y2={y(last.c)} />
          {hover != null && <line className="cross" x1={x(hover)} x2={x(hover)} y1={PAD_T} y2={PAD_T + PLOT_H} />}
        </svg>
      </div>
      <p className="muted chart-legend">
        <span className="sw ema20" /> EMA20 <span className="sw ema50" /> EMA50 <span className="sw buy" /> BUY signal
        <span className="sw sell" /> SELL signal · Vaqt qurilmangiz soatida ko'rsatilgan.
      </p>
    </div>
  );
}
