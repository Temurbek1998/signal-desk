import { signalLabel } from "@/lib/types.ts";
import { recentClosed, trackRecord } from "@/lib/server/track.ts";

export const metadata = { title: "Natijalar" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { tp1: "TP 1", tp2: "TP 2", sl: "SL", close: "Kun oxiri" };
const pips = (s: { strategy: string }) => s.strategy !== "trend";

export default async function ResultsPage() {
  const [record, recent] = await Promise.all([trackRecord(90), recentClosed(40)]);
  const rows = ["M5", "M15", "M30", "H1", "ALL"].map((tf) => record.find((r) => r.timeframe === tf)).filter(Boolean);

  return (
    <main className="wrap">
      <header className="page-head">
        <div>
          <h1>Natijalar</h1>
          <p className="sub">Robot bergan barcha yopilgan signallar, so'nggi 90 kun. Faol signallar faqat obunachilarga ko'rinadi.</p>
        </div>
      </header>

      <section className="panel">
        <h2>Taymfreymlar bo'yicha</h2>
        {rows.length === 0 ? (
          <p className="muted">Hali yopilgan signal yo'q. Robot ishga tushgach natijalar shu yerda paydo bo'ladi.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Taymfreym</th><th className="num">Signallar</th><th className="num">Win rate</th><th className="num">Profit factor</th><th className="num">Jami R</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r!.timeframe}>
                    <td>{r!.timeframe === "ALL" ? "Hammasi" : r!.timeframe}</td>
                    <td className="num">{r!.closed}</td>
                    <td className="num">{Math.round(r!.winRate * 100)}%</td>
                    <td className="num">{r!.profitFactor?.toFixed(2) ?? "—"}</td>
                    <td className={`num ${r!.totalR >= 0 ? "up" : "down"}`}>{r!.totalR >= 0 ? "+" : ""}{r!.totalR.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">
          Win rate: TP1 ga Stop Loss dan oldin yetgan signallar ulushi. R: risk birligidagi natija (SL = −1R). TP1 da
          pozitsiyaning yarmi yopiladi, oltinda qolgan yarmi uchun SL narx ortidan 1 ATR masofada ergashadi va savdo ko'pi bilan 8 soatda yopiladi.
        </p>
      </section>

      {recent.length > 0 && (
        <section className="panel">
          <h2>So'nggi yopilgan signallar</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Vaqt</th><th>Juftlik</th><th>TF</th><th>Yo'nalish</th><th className="num">Kirish</th><th className="num">SL</th><th>Natija</th><th className="num">R</th></tr>
              </thead>
              <tbody>
                {recent.map((s) => (
                  <tr key={s.id}>
                    <td>{new Date(s.signal_time).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</td>
                    <td>{s.pair}</td>
                    <td>{s.timeframe} <span className="muted">· {signalLabel(s.strategy)}</span></td>
                    <td className={s.side === "BUY" ? "up" : "down"}>{s.side}</td>
                    <td className="num">{Number(s.entry).toPrecision(6)}</td>
                    <td className="num">{Number(s.sl).toPrecision(6)}</td>
                    <td><span className={`pill ${s.status}`}>{pips(s) && s.status === "tp2" ? "TP" : STATUS[s.status]}</span></td>
                    <td className={`num ${Number(s.result_r) >= 0 ? "up" : "down"}`}>{Number(s.result_r) >= 0 ? "+" : ""}{Number(s.result_r).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
