import Link from "next/link";
import { adminHref } from "@/lib/adminPath.ts";
import { signalLabel } from "@/lib/types.ts";
import AutoRefresh from "../../components/AutoRefresh.tsx";
import LocalTime from "../../components/LocalTime.tsx";
import { requireAdmin } from "@/lib/server/auth.ts";
import { sql } from "@/lib/server/db.ts";
import { digitsOf } from "@/lib/server/analysis.ts";

export const metadata = { title: "Signallar (admin)", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Row = { id: number; pair: string; category: string; timeframe: string; strategy: string; side: string; entry: number; tp1: number; tp2: number; sl: number;
  confidence: number; signal_time: Date; status: string; result_r: number | null; rating: string | null; updated_at: Date };

const STATUS: Record<string, string> = { active: "Ochiq", tp1: "TP 1", tp2: "TP 2", sl: "SL", close: "Yopildi" };
const FILTERS = [{ k: "", l: "Hammasi" }, { k: "active", l: "Ochiq" }, { k: "closed", l: "Yopilgan" }];

export default async function AdminSignals({ searchParams }: { searchParams: Promise<{ f?: string; pair?: string }> }) {
  await requireAdmin();
  const q = await searchParams;
  const where = q.f === "active" ? "status = 'active'" : q.f === "closed" ? "status <> 'active'" : "true";
  const [rows, [sum]] = await Promise.all([
    sql<Row>(`SELECT * FROM signal_log WHERE ${where} AND ($1::text IS NULL OR pair = $1) ORDER BY signal_time DESC LIMIT 300`, [q.pair || null]),
    sql<{ total: string; open: string; wins: string; closed: string; r: number | null }>(
      `SELECT count(*) AS total, count(*) FILTER (WHERE status = 'active') AS open,
              count(*) FILTER (WHERE status <> 'active' AND result_r > 0) AS wins, count(*) FILTER (WHERE status <> 'active') AS closed,
              sum(result_r) FILTER (WHERE status <> 'active') AS r FROM signal_log`,
    ),
  ]);
  const href = (f: string) => `${adminHref("/signallar")}${f ? `?f=${f}` : ""}`;
  const fmt = (pair: string, v: number) => Number(v).toFixed(digitsOf(pair, Number(v)));
  const closed = Number(sum.closed);

  return (
    <main className="wrap">
      <AutoRefresh seconds={60} />
      <header className="page-head">
        <div>
          <h1>Signallar</h1>
          <p className="sub">Robot bergan barcha signallar: barcha bozorlar va reytinglar, mijozlarga ko'rinmaydiganlari ham.</p>
        </div>
      </header>

      <div className="stats">
        <div className="stat"><b>{sum.total}</b><span>Jami signal</span></div>
        <div className="stat"><b>{sum.open}</b><span>Hozir ochiq</span></div>
        <div className="stat"><b>{closed ? `${Math.round((Number(sum.wins) / closed) * 100)}%` : "—"}</b><span>Yutuq ulushi, {closed} yopilgan</span></div>
        <div className="stat"><b className={(sum.r ?? 0) >= 0 ? "up" : "down"}>{sum.r == null ? "—" : `${sum.r >= 0 ? "+" : ""}${Number(sum.r).toFixed(1)}R`}</b><span>Jami natija (risk birligida)</span></div>
      </div>

      <section className="panel">
        <div className="chips">
          {FILTERS.map((f) => <Link key={f.k} href={href(f.k)} aria-current={(q.f ?? "") === f.k}>{f.l}</Link>)}
        </div>
        {rows.length === 0 ? (
          <p className="muted">Hali signal yo'q. Robot har 5 daqiqada tahlil qiladi va qoidalar mos kelganda signal yozadi.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Vaqt</th><th>Juftlik</th><th>Robot</th><th>Yo'nalish</th><th>Reyting</th><th className="num">Kirish</th><th className="num">TP 1</th>
                  <th className="num">TP 2</th><th className="num">SL</th><th className="num">Ishonch</th><th>Holat</th><th className="num">Natija</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td><LocalTime at={s.signal_time} /></td>
                    <td><b>{s.pair}</b> <span className="muted">{s.timeframe}</span></td>
                    <td>{signalLabel(s.strategy)}</td>
                    <td className={s.side === "BUY" ? "up" : "down"}>{s.side}</td>
                    <td>{s.rating && <span className={`pill rating-${s.rating}`}>{s.rating}</span>}</td>
                    <td className="num">{fmt(s.pair, s.entry)}</td>
                    <td className="num">{fmt(s.pair, s.tp1)}</td>
                    <td className="num">{fmt(s.pair, s.tp2)}</td>
                    <td className="num">{fmt(s.pair, s.sl)}</td>
                    <td className="num">{s.confidence}%</td>
                    <td><span className={`pill ${s.status}`}>{STATUS[s.status] ?? s.status}</span></td>
                    <td className={`num ${(s.result_r ?? 0) > 0 ? "up" : (s.result_r ?? 0) < 0 ? "down" : ""}`}>{s.result_r == null ? "—" : `${s.result_r > 0 ? "+" : ""}${Number(s.result_r).toFixed(2)}R`}</td>
                    <td><Link className="btn-small" href={`${adminHref("/tahlil")}?pair=${encodeURIComponent(s.pair)}&tf=${s.timeframe}`}>Grafik</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
