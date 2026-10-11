import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const pair = p.get("pair") ?? "XAU/USD";
  const action = p.get("action") ?? "BUY";
  const entry = parseFloat(p.get("entry") ?? "0");
  const sl = parseFloat(p.get("sl") ?? "0");
  const tp1 = parseFloat(p.get("tp1") ?? "0");
  const tp2 = parseFloat(p.get("tp2") ?? "0");
  const conf = p.get("conf") ?? "0";
  const mode = p.get("mode") ?? "intraday";

  const isBuy = action === "BUY";
  const accentColor = isBuy ? "#22c55e" : "#ef4444";
  const arrowChar = isBuy ? "▲" : "▼";

  // Price scale: all levels sorted
  const allLevels = [sl, entry, tp1, tp2].filter(Boolean);
  const minP = Math.min(...allLevels);
  const maxP = Math.max(...allLevels);
  const range = maxP - minP || 1;

  // Normalize price to 0-100% of scale height (top=100%, bottom=0%)
  const toY = (price: number) => {
    const pct = (price - minP) / range;
    return isBuy ? (1 - pct) * 100 : pct * 100;
  };

  const fmt = (v: number) =>
    v > 999 ? v.toFixed(2) : v > 9 ? v.toFixed(4) : v.toFixed(5);

  const modeLabel = mode === "swing" ? "SWING" : "INTRADAY";

  const levels = [
    { price: tp2, label: "TP2", color: "#16a34a", y: toY(tp2) },
    { price: tp1, label: "TP1", color: "#22c55e", y: toY(tp1) },
    { price: entry, label: "Kirish", color: "#f8fafc", y: toY(entry) },
    { price: sl, label: "SL", color: "#ef4444", y: toY(sl) },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: 600,
          height: 320,
          background: "#0d1117",
          display: "flex",
          flexDirection: "row",
          fontFamily: "monospace",
          color: "#f8fafc",
          padding: 24,
          gap: 24,
        }}
      >
        {/* Left: info */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, gap: 8 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: accentColor,
              }}
            >
              {arrowChar} {action}
            </span>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{pair}</span>
              <span style={{ fontSize: 12, color: "#94a3b8" }}>{modeLabel} · Ishonch {conf}%</span>
            </div>
          </div>

          {/* Price table */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 6,
              marginTop: 12,
              background: "#161b22",
              borderRadius: 8,
              padding: "12px 16px",
            }}
          >
            {levels.map((lv) => (
              <div
                key={lv.label}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ fontSize: 13, color: "#94a3b8", width: 60 }}>{lv.label}</span>
                <span style={{ fontSize: 16, fontWeight: 600, color: lv.color, fontFamily: "monospace" }}>
                  {fmt(lv.price)}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", marginTop: "auto", color: "#475569", fontSize: 11 }}>
            Zeus Number One · AI Treyder (demo)
          </div>
        </div>

        {/* Right: visual price scale */}
        <div
          style={{
            width: 64,
            display: "flex",
            flexDirection: "column",
            position: "relative",
            background: "#161b22",
            borderRadius: 8,
            padding: "8px 0",
          }}
        >
          {levels.map((lv) => (
            <div
              key={lv.label}
              style={{
                position: "absolute",
                top: `${lv.y}%`,
                left: 0,
                right: 0,
                display: "flex",
                alignItems: "center",
                transform: "translateY(-50%)",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: 2,
                  background: lv.color,
                  opacity: lv.label === "Kirish" ? 1 : 0.7,
                }}
              />
            </div>
          ))}
          {/* Entry thick line */}
          <div
            style={{
              position: "absolute",
              top: `${toY(entry)}%`,
              left: 0,
              right: 0,
              display: "flex",
              alignItems: "center",
              transform: "translateY(-50%)",
            }}
          >
            <div style={{ width: "100%", height: 3, background: "#f8fafc" }} />
          </div>
        </div>
      </div>
    ),
    { width: 600, height: 320 }
  );
}
