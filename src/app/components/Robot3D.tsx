import Tilt from "./Tilt.tsx";

// Zeus roboti 3D ko'rinishda: sof CSS 3D qutilardan yig'ilgan, sekin aylanadi va nafas oladi.
// Ko'kragidagi ekranda grafik, ko'zlari fosfor yashil yonadi. Sichqoncha/barmoq bilan qiyshayadi.

type BoxProps = { w: number; h: number; d: number; x?: number; y?: number; z?: number; className?: string; front?: React.ReactNode };

function Box({ w, h, d, x = 0, y = 0, z = 0, className = "", front }: BoxProps) {
  const style = { ["--w" as string]: `${w}px`, ["--h" as string]: `${h}px`, ["--d" as string]: `${d}px`, ["--tx" as string]: `${x}px`, ["--ty" as string]: `${y}px`, ["--tz" as string]: `${z}px` };
  return (
    <div className={`bx ${className}`} style={style}>
      <i className="f">{front}</i><i className="b" /><i className="l" /><i className="r" /><i className="t" /><i className="m" />
    </div>
  );
}

export default function Robot3D() {
  return (
    <Tilt className="rb-stage">
      <div className="rb-scene" aria-hidden="true">
        <div className="rb-floor" />
        <div className="rb-shadow" />
        <div className="rb-bot">
          <div className="rb-head">
            <Box w={96} h={70} d={70} y={-118} className="rb-metal" front={<span className="rb-face"><b /><b /><em /></span>} />
            <Box w={8} h={22} d={8} y={-164} className="rb-dark" />
            <Box w={16} h={16} d={16} y={-180} className="rb-glow rb-ant" />
            <Box w={12} h={26} d={26} x={-54} y={-118} className="rb-dark" />
            <Box w={12} h={26} d={26} x={54} y={-118} className="rb-dark" />
          </div>
          <Box w={30} h={12} d={30} y={-78} className="rb-dark" />
          <Box w={120} h={104} d={64} y={-18} className="rb-metal"
            front={<span className="rb-screen"><svg viewBox="0 0 80 40"><path d="M2 32 L14 26 L22 29 L34 18 L44 22 L56 10 L66 14 L78 4" /></svg><small>XAU/USD</small></span>} />
          <div className="rb-arm l"><Box w={24} h={86} d={24} x={-76} y={-14} className="rb-dark" /><Box w={28} h={22} d={28} x={-76} y={40} className="rb-metal" /></div>
          <div className="rb-arm r"><Box w={24} h={86} d={24} x={76} y={-14} className="rb-dark" /><Box w={28} h={22} d={28} x={76} y={40} className="rb-metal" /></div>
          <Box w={34} h={58} d={34} x={-28} y={64} className="rb-dark" />
          <Box w={34} h={58} d={34} x={28} y={64} className="rb-dark" />
          <Box w={42} h={14} d={46} x={-28} y={100} z={6} className="rb-metal" />
          <Box w={42} h={14} d={46} x={28} y={100} z={6} className="rb-metal" />
        </div>
        <div className="rb-orbit">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`rb-chip ${i % 2 ? "dn" : "up"}`} style={{ ["--a" as string]: `${i * 90}deg` }}>
              <Box w={12} h={i % 2 ? 22 : 34} d={12} className="rb-candle" />
            </div>
          ))}
        </div>
      </div>
    </Tilt>
  );
}
