"use client";
import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries, ColorType, createChart, createSeriesMarkers, CrosshairMode, LineSeries, LineStyle,
  type IChartApi, type ISeriesApi, type SeriesMarker, type Time, type UTCTimestamp,
} from "lightweight-charts";
import type { ChartCandle, ChartLevel, ChartSignal, ChartZone } from "./RobotChart.tsx";

// TradingView uslubidagi grafik (TradingView'ning ochiq Lightweight Charts kutubxonasi): kattalashtirish, surish,
// shamlar, EMA20/EMA50, signal darajalari (kirish, SL, TP) va Claude chizgan darajalar hamda zonalar. Faqat admin.

const KIND: Record<string, string> = { support: "Tayanch", resistance: "Qarshilik", demand: "Talab", supply: "Taklif", liquidity: "Likvidlik", invalidation: "Bekor" };

const css = (name: string, fb: string) => (typeof window === "undefined" ? fb : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fb);
const alpha = (c: string, a: number) => {
  const m = c.match(/^#([0-9a-f]{6})$/i);
  if (!m) return c;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

export default function TvChart({ candles, ema20, ema50, signals, digits, levels = [], zones = [], drawAll = false, height = 560 }: {
  candles: ChartCandle[]; ema20: number[]; ema50: number[]; signals: ChartSignal[]; digits: number; tfMinutes?: number;
  levels?: ChartLevel[]; zones?: ChartZone[]; drawAll?: boolean; height?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const zoneBox = useRef<HTMLDivElement>(null);
  // Kun/tun rejimi almashsa grafik ranglari qayta o'qiladi.
  const [theme, setTheme] = useState(0);
  useEffect(() => {
    const bump = () => setTheme((x) => x + 1);
    const mo = new MutationObserver(bump);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    mq.addEventListener("change", bump);
    return () => { mo.disconnect(); mq.removeEventListener("change", bump); };
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el || candles.length < 2) return;
    // Vaqt qurilma soat mintaqasida: kutubxona UTC ko'rsatadi, shuning uchun siljitamiz.
    const off = -new Date().getTimezoneOffset() * 60;
    const T = (ms: number) => (Math.floor(ms / 1000) + off) as UTCTimestamp;
    const up = css("--buy", "#3dffa0"), down = css("--sell", "#ff4d6a"), fg = css("--fg", "#d8ffd0"), muted = css("--muted", "#7a9a74");
    const line = css("--line", "#1c3318"), gold = css("--gold", "#39ff14"), e50 = css("--ema50", "#4aa3ff"), bg = css("--surface", "#0c140f");
    const h = window.innerWidth < 640 ? Math.min(height, 420) : height;

    const chart: IChartApi = createChart(el, {
      height: h,
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: bg }, textColor: muted, fontSize: 12, attributionLogo: true },
      grid: { vertLines: { color: alpha(line, 0.5) }, horzLines: { color: alpha(line, 0.5) } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: line, scaleMargins: { top: 0.08, bottom: 0.08 } },
      timeScale: { borderColor: line, timeVisible: true, secondsVisible: false, rightOffset: 6 },
      localization: { locale: "ru-RU", priceFormatter: (p: number) => p.toFixed(digits) },
    });

    const active = drawAll ? signals : signals.filter((s) => s.status === "active");
    const extra = [
      ...active.flatMap((s) => [s.entry, s.sl, s.tp1, s.tp2]),
      ...levels.map((l) => l.price), ...zones.flatMap((z) => [z.from, z.to]),
    ].filter(Number.isFinite);

    const cs: ISeriesApi<"Candlestick"> = chart.addSeries(CandlestickSeries, {
      upColor: up, downColor: down, borderUpColor: up, borderDownColor: down, wickUpColor: up, wickDownColor: down,
      priceFormat: { type: "price", precision: digits, minMove: 1 / 10 ** digits },
      // Darajalar ekrandan chiqib ketmasin: avtomasshtabga qo'shiladi.
      autoscaleInfoProvider: (orig: () => { priceRange: { minValue: number; maxValue: number } } | null) => {
        const r = orig();
        if (!r || !extra.length) return r;
        return { ...r, priceRange: { minValue: Math.min(r.priceRange.minValue, ...extra), maxValue: Math.max(r.priceRange.maxValue, ...extra) } };
      },
    });
    cs.setData(candles.map((c) => ({ time: T(c.t), open: c.o, high: c.h, low: c.l, close: c.c })));

    const ema = (vals: number[], color: string) => {
      const s = chart.addSeries(LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
      s.setData(candles.map((c, i) => ({ time: T(c.t), value: vals[i] })).filter((p) => Number.isFinite(p.value)));
    };
    ema(ema20, gold);
    ema(ema50, e50);

    for (const s of active) {
      const lv: [string, number, string, LineStyle][] = [["Kirish", s.entry, fg, LineStyle.Solid], ["TP1", s.tp1, up, LineStyle.Dashed], ["TP2", s.tp2, up, LineStyle.Dashed], ["SL", s.sl, down, LineStyle.Dashed]];
      for (const [title, price, color, lineStyle] of lv) cs.createPriceLine({ price, color, lineWidth: 2, lineStyle, axisLabelVisible: true, title });
    }
    for (const l of levels) {
      const color = l.kind === "support" || l.kind === "demand" ? up : l.kind === "resistance" || l.kind === "supply" ? down : l.kind === "invalidation" ? fg : e50;
      cs.createPriceLine({ price: l.price, color: alpha(color, 0.85), lineWidth: 1, lineStyle: l.kind === "invalidation" ? LineStyle.LargeDashed : LineStyle.Dotted, axisLabelVisible: true, title: KIND[l.kind] ?? l.kind });
    }

    const first = candles[0].t, last = candles[candles.length - 1].t;
    const markers: SeriesMarker<Time>[] = signals
      .filter((s) => s.t >= first && s.t <= last + 1)
      .map((s): SeriesMarker<Time> => {
        const c = [...candles].reverse().find((x) => x.t <= s.t) ?? candles[0];
        return { time: T(c.t), position: s.side === "BUY" ? "belowBar" as const : "aboveBar" as const, shape: s.side === "BUY" ? "arrowUp" as const : "arrowDown" as const, color: s.side === "BUY" ? gold : down, text: s.label, size: 1.4 };
      })
      .sort((a, b) => Number(a.time) - Number(b.time));
    createSeriesMarkers(cs, markers);

    // Zonalar: kutubxonada to'rtburchak yo'q, shuning uchun narx koordinatasi bo'yicha joylashadigan yarim shaffof qatlam.
    const zb = zoneBox.current!;
    zb.replaceChildren(...zones.map((z) => {
      const d = document.createElement("div");
      d.className = `tv-zone ${z.kind}`;
      d.title = `${KIND[z.kind]} zonasi ${z.from.toFixed(digits)}–${z.to.toFixed(digits)}: ${z.note}`;
      d.textContent = `${KIND[z.kind]} zonasi`;
      return d;
    }));
    let raf = 0;
    const place = () => {
      zones.forEach((z, i) => {
        const a = cs.priceToCoordinate(z.to), b = cs.priceToCoordinate(z.from);
        const d = zb.children[i] as HTMLDivElement;
        if (a == null || b == null) { d.style.display = "none"; return; }
        d.style.display = "";
        d.style.top = `${Math.min(a, b)}px`;
        d.style.height = `${Math.max(2, Math.abs(b - a))}px`;
        d.style.right = `${chart.priceScale("right").width()}px`;
      });
      raf = requestAnimationFrame(place);
    };
    if (zones.length) raf = requestAnimationFrame(place);

    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, candles.length - 120), to: candles.length + 6 });
    return () => { cancelAnimationFrame(raf); chart.remove(); };
  }, [candles, ema20, ema50, signals, digits, levels, zones, drawAll, height, theme]);

  if (candles.length < 2) return <p className="muted">Grafik uchun ma&apos;lumot yo&apos;q.</p>;
  return (
    <div className="tv-wrap">
      <div ref={box} className="tv-chart" />
      <div ref={zoneBox} className="tv-zones" aria-hidden />
      <p className="muted chart-legend">
        <span className="sw ema20" /> EMA20 <span className="sw ema50" /> EMA50 <span className="sw buy" /> BUY <span className="sw sell" /> SELL
        {(levels.length > 0 || zones.length > 0) && <> <span className="sw lvl" /> Claude darajalari <span className="sw zone" /> zonalar</>}
        {" "}· Sichqoncha g&apos;ildiragi: kattalashtirish, sudrash: surish. Vaqt qurilmangiz soatida.
      </p>
    </div>
  );
}
