import type { AiAnalysis } from "@/lib/aiAnalysis.ts";

// Claude tahlili bloklari: strategiya, trendlar, asoslar, xavflar, darajalar va ssenariy (faqat admin).
const TREND: Record<string, string> = { up: "↑ yuqori", down: "↓ past", flat: "→ yon" };
const KIND: Record<string, string> = { support: "Tayanch", resistance: "Qarshilik", demand: "Talab", supply: "Taklif", liquidity: "Likvidlik" };

export default function AiAnalysisView({ a, digits = 2 }: { a: AiAnalysis | null; digits?: number }) {
  const fx = (v: number) => v.toFixed(digits);
  if (!a) return <section className="panel"><h2>Claude tahlili</h2><p className="muted" style={{ margin: 0 }}>To&apos;liq tahlil hali yo&apos;q. Yangi signal va qarorlarda Claude tahlili shu yerda chiziladi.</p></section>;
  return (
    <>
      <section className="panel">
        <h2>Claude tahlili</h2>
        <p style={{ marginTop: 0 }}><b>Strategiya:</b> {a.strategy}</p>
        <div className="an-trends">
          {(["D1", "H4", "H1", "M15"] as const).map((k) => (
            <div key={k}><b>{k}</b><span className={a.trends[k] === "up" ? "up" : a.trends[k] === "down" ? "down" : ""}>{TREND[a.trends[k]]}</span></div>
          ))}
        </div>
      </section>
      <div className="an-grid">
        <section className="panel">
          <h2>Asoslar</h2>
          <ul className="an-list">{a.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {a.risks.length > 0 && <><h3>Xavflar</h3><ul className="an-list">{a.risks.map((r) => <li key={r}>{r}</li>)}</ul></>}
        </section>
        <section className="panel">
          <h2>Darajalar va zonalar</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {a.zones.map((z, i) => <tr key={"z" + i}><th>{KIND[z.kind]} zonasi</th><td className="mono">{fx(z.from)}–{fx(z.to)}</td><td className="muted">{z.note}</td></tr>)}
                {[...a.levels].sort((x, y) => y.price - x.price).map((l, i) => <tr key={"l" + i}><th>{KIND[l.kind] ?? l.kind}</th><td className="mono">{fx(l.price)}</td><td className="muted">{l.note}</td></tr>)}
                {a.invalidation != null && <tr><th>Bekor bo&apos;lish</th><td className="mono">{fx(a.invalidation)}</td><td className="muted">G&apos;oya shu narxda bekor</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {a.scenario && <section className="panel"><h2>Ssenariy</h2><p style={{ margin: 0 }}>{a.scenario}</p></section>}
    </>
  );
}
