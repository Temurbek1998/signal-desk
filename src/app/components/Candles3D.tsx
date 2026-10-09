import Tilt from "./Tilt.tsx";

// Bosh sahifa uchun 3D yapon shamlari: sof CSS 3D (kutubxonasiz), sekin aylanadi va tebranadi,
// sichqoncha/barmoq bilan qiyshayadi. Harakatni kamaytirish yoqilgan qurilmalarda qimirlamaydi.

const DELTAS = [18, -10, 24, 14, -16, 8, 30, -12, -20, 26, 34, -14, 22, 40, -18, 28];
const WICKS = [[6, 9], [4, 7], [10, 5], [7, 8], [5, 11], [9, 4], [6, 12], [8, 6], [4, 10], [11, 7], [6, 9], [9, 5], [7, 8], [5, 12], [10, 6], [8, 9]];

function build() {
  let p = 0;
  const raw = DELTAS.map((d, i) => {
    const o = p, c = p + d;
    p = c;
    return { o, c, h: Math.max(o, c) + WICKS[i][0], l: Math.min(o, c) - WICKS[i][1] };
  });
  const hi = Math.max(...raw.map((r) => r.h)), lo = Math.min(...raw.map((r) => r.l));
  const k = 290 / (hi - lo), mid = (hi + lo) / 2;
  const y = (v: number) => -(v - mid) * k;
  const n = raw.length;
  return raw.map((r, i) => {
    const t = i - (n - 1) / 2;
    return {
      up: r.c >= r.o,
      x: t * 30, z: -t * t * 2,
      top: y(Math.max(r.o, r.c)), h: Math.max(4, Math.abs(r.c - r.o) * k),
      wt: y(r.h), wh: (r.h - r.l) * k,
      delay: (i * 0.37) % 3,
    };
  });
}

export default function Candles3D() {
  const candles = build();
  const last = candles[candles.length - 1];
  return (
    <Tilt className="c3-stage">
      <div className="c3-scene" aria-hidden="true">
        <div className="c3-floor" />
        <div className="c3-line tp" style={{ ["--ly" as string]: `${last.top - 24}px` }}><span>TP</span></div>
        <div className="c3-line sl" style={{ ["--ly" as string]: `${last.top + last.h + 60}px` }}><span>SL</span></div>
        {candles.map((c, i) => (
          <div
            key={i}
            className={`c3-candle ${c.up ? "up" : "dn"} ${i === candles.length - 1 ? "live" : ""}`}
            style={{ ["--x" as string]: `${c.x}px`, ["--z" as string]: `${c.z}px`, ["--d" as string]: `${c.delay}s` }}
          >
            <div className="c3-wick" style={{ ["--wt" as string]: `${c.wt}px`, ["--wh" as string]: `${c.wh}px` }}><i /><i /></div>
            <div className="c3-body" style={{ ["--top" as string]: `${c.top}px`, ["--h" as string]: `${c.h}px` }}>
              <i className="f" /><i className="b" /><i className="l" /><i className="r" /><i className="t" /><i className="m" />
            </div>
          </div>
        ))}
      </div>
    </Tilt>
  );
}
