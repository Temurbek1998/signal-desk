"use server";
import { getMarketLevels, refreshAllMarketLevels } from "@/lib/server/marketAnalysis.ts";
import { traderPairs } from "@/lib/server/aiTrader.ts";
import LocalTime from "../../components/LocalTime.tsx";
import AutoRefresh from "../../components/AutoRefresh.tsx";

export const metadata = { title: "Bozor tahlili", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function runAnalysis() {
  "use server";
  await refreshAllMarketLevels(true);
}

const trendLabel = (t: string) => t === "bull" ? "📈 Yuqoriga" : t === "bear" ? "📉 Pastga" : "↔ Yon";
const klass = (t: string) => t === "bull" ? "up" : t === "bear" ? "down" : "";

export default async function BozorPage() {
  const pairs = traderPairs().map((i) => i.pair);
  const levels = await Promise.all(pairs.map((p) => getMarketLevels(p)));

  return (
    <main style={{ padding: "1rem 1.5rem" }}>
      <AutoRefresh seconds={300} />
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.25rem" }}>Bozor tarixiy tahlili</h1>
        <form action={runAnalysis}>
          <button type="submit" style={{ fontSize: "0.8rem", padding: "0.3rem 0.8rem", cursor: "pointer" }}>
            Hozir yangilash
          </button>
        </form>
      </div>

      {pairs.map((pair, i) => {
        const ml = levels[i];
        if (!ml) return (
          <section key={pair} style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>{pair}</h2>
            <p style={{ opacity: 0.5, fontSize: "0.85rem" }}>Tahlil hali bajarilmagan. Keyingi cron da avtomatik ishga tushadi.</p>
          </section>
        );
        const lvl = ml.levels;
        return (
          <section key={pair} style={{ marginBottom: "2.5rem", borderTop: "1px solid var(--border,#333)", paddingTop: "1rem" }}>
            <div style={{ display: "flex", gap: "1.5rem", alignItems: "baseline", marginBottom: "0.75rem" }}>
              <h2 style={{ fontSize: "1rem", margin: 0 }}>{pair}</h2>
              <span className={klass(ml.trend_long)} style={{ fontWeight: 600, fontSize: "0.9rem" }}>
                Uzun: {trendLabel(ml.trend_long)}
              </span>
              <span className={klass(ml.trend_medium)} style={{ fontSize: "0.85rem" }}>
                O'rta: {trendLabel(ml.trend_medium)}
              </span>
              <span style={{ opacity: 0.5, fontSize: "0.78rem" }}>
                <LocalTime at={ml.analyzed_at} />
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem", marginBottom: "0.75rem", fontSize: "0.82rem" }}>
              <div>Yillik: <b className="up">{lvl.yillik_high}</b> / <b className="down">{lvl.yillik_low}</b></div>
              <div>3 yillik: <b className="up">{lvl.uch_yillik_high}</b> / <b className="down">{lvl.uch_yillik_low}</b></div>
              <div>Oylik: <b className="up">{lvl.oylik_high}</b> / <b className="down">{lvl.oylik_low}</b></div>
              <div>Haftalik: <b className="up">{lvl.haftalik_high}</b> / <b className="down">{lvl.haftalik_low}</b></div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "0.75rem", fontSize: "0.82rem" }}>
              <div>
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }} className="down">Qarshilik darajalari</div>
                {lvl.kuchli_qarshilik.map((r, j) => <div key={j}>{r}</div>)}
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }} className="up">Tayanch darajalari</div>
                {lvl.kuchli_tayanch.map((s, j) => <div key={j}>{s}</div>)}
              </div>
            </div>

            {lvl.supply_zonalar.length > 0 && (
              <div style={{ marginBottom: "0.75rem", fontSize: "0.82rem" }}>
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }} className="down">Supply zonalar</div>
                {lvl.supply_zonalar.map((z, j) => (
                  <div key={j}>{z.pastki}–{z.yuqori} <span style={{ opacity: 0.6 }}>({z.kuch}) {z.sabab}</span></div>
                ))}
              </div>
            )}

            {lvl.demand_zonalar.length > 0 && (
              <div style={{ marginBottom: "0.75rem", fontSize: "0.82rem" }}>
                <div style={{ fontWeight: 600, marginBottom: "0.25rem" }} className="up">Demand zonalar</div>
                {lvl.demand_zonalar.map((z, j) => (
                  <div key={j}>{z.pastki}–{z.yuqori} <span style={{ opacity: 0.6 }}>({z.kuch}) {z.sabab}</span></div>
                ))}
              </div>
            )}

            {lvl.psixologik.length > 0 && (
              <div style={{ fontSize: "0.82rem", marginBottom: "0.75rem" }}>
                <span style={{ fontWeight: 600 }}>Psixologik: </span>
                {lvl.psixologik.join(" · ")}
              </div>
            )}

            <p style={{ fontSize: "0.83rem", opacity: 0.8, fontStyle: "italic", margin: 0 }}>{ml.summary}</p>
          </section>
        );
      })}
    </main>
  );
}
