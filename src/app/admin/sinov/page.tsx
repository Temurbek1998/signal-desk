import Link from "next/link";
import { adminHref } from "@/lib/adminPath.ts";
import { runMarketTestNow } from "../../actions.ts";
import PendingButton from "../../components/PendingButton.tsx";
import { requireAdmin } from "@/lib/server/auth.ts";
import { lastMarketTest } from "@/lib/server/marketTest.ts";

export const metadata = { title: "Bozorlar sinovi", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const CAT: Record<string, string> = { forex: "Valyuta", crypto: "Kripto", gold: "Oltin" };
const pct = (x: number) => `${Math.round(x * 100)}%`;
const r2 = (x: number) => (x > 0 ? "+" : "") + x.toFixed(2);

export default async function MarketTestPage() {
  await requireAdmin();
  const last = await lastMarketTest();
  const rows = (last?.rows ?? []).slice().sort((a, b) => b.avgR - a.avgR);
  return (
    <main className="wrap">
      <header className="page-head">
        <div>
          <h1>Bozorlar sinovi</h1>
          <p className="sub">Robotning joriy qoidalari har bir bozorning so'nggi ~60 kunlik tarixida, komissiyadan keyin</p>
        </div>
        <Link className="btn sm" href={adminHref("/robot")}>Robot jurnali</Link>
      </header>

      <section className="panel">
        <div className="bar">
          <p className="muted" style={{ margin: 0 }}>
            {last ? `Oxirgi sinov: ${new Date(last.at).toLocaleString("ru-RU")}. Haftada bir marta o'zi yangilanadi.` : "Hali sinov o'tkazilmagan."}
          </p>
          <form action={runMarketTestNow}><PendingButton label="Hozir sinash" busy="Sinalmoqda…" /></form>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          O'rtacha R: bir savdodagi o'rtacha foyda, risk birligida (−1 = to'liq SL). <b>Foydali</b>: umumiy natija ham,
          ma'lumotning ikkala yarmi ham musbat. Oltin bu yerda yo'q: u kattaroq tarixda alohida sinalgan.
        </p>
        {rows.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Bozor</th><th>Taymfreym</th><th className="num">Savdolar</th><th className="num">Win rate</th>
                  <th className="num">O'rtacha R</th><th className="num">PF</th><th className="num">1-yarm / 2-yarm</th><th>Xulosa</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.pair + r.tf}>
                    <td><b>{r.pair}</b> <span className="muted">{CAT[r.category]}</span></td>
                    <td>{r.tf}</td>
                    <td className="num">{r.trades}</td>
                    <td className="num">{pct(r.winRate)}</td>
                    <td className={`num ${r.avgR > 0 ? "up" : "down"}`}>{r2(r.avgR)}</td>
                    <td className="num">{Number.isFinite(r.pf) ? r.pf.toFixed(2) : "∞"}</td>
                    <td className="num">{r2(r.half1)} / {r2(r.half2)}</td>
                    <td><span className={`pill ${r.verdict === "foydali" ? "tp1" : r.verdict === "zararli" ? "sl" : "active"}`}>{r.verdict}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {last?.errors && <p className="err">{last.errors}</p>}
      </section>
    </main>
  );
}
