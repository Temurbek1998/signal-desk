// Tarif belgisi: 1, 2 yoki 3 ta aylanib turuvchi 3D sham (Standart, PRO, VIP).
const SETS = [[{ top: -14, h: 28 }], [{ top: -4, h: 22 }, { top: -22, h: 34 }], [{ top: 2, h: 18 }, { top: -14, h: 28 }, { top: -30, h: 40 }]];

export default function MiniCandles({ n }: { n: 1 | 2 | 3 }) {
  const set = SETS[n - 1];
  return (
    <div className="mini3d" aria-hidden="true">
      <div className="mini3d-scene">
        {set.map((c, i) => (
          <div key={i} className="c3-candle up" style={{ ["--x" as string]: `${(i - (set.length - 1) / 2) * 22}px`, ["--z" as string]: "0px", ["--d" as string]: `${i * 0.4}s` }}>
            <div className="c3-wick" style={{ ["--wt" as string]: `${c.top - 8}px`, ["--wh" as string]: `${c.h + 16}px` }}><i /><i /></div>
            <div className="c3-body" style={{ ["--top" as string]: `${c.top}px`, ["--h" as string]: `${c.h}px` }}>
              <i className="f" /><i className="b" /><i className="l" /><i className="r" /><i className="t" /><i className="m" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
