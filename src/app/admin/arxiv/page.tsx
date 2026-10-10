import Link from "next/link";
import { adminHref } from "@/lib/adminPath.ts";
import { isDay, tashDay, TZ_SQL } from "@/lib/day.ts";
import { requireAdmin } from "@/lib/server/auth.ts";
import { sql } from "@/lib/server/db.ts";
import LocalTime from "../../components/LocalTime.tsx";

export const metadata = { title: "Kunlik arxiv", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

// Kunlik arxiv (egasining talabi, 2026-10-11): jurnallar (Robot logi, AI treyder, Demo hisob) faqat bugunni ko'rsatadi,
// oldingi kunlarning tahlillari, qarorlari, savdolari va hodisalari shu yerda Toshkent kuni bo'yicha. Hech narsa o'chirilmaydi.
const DAY = (col: string) => `(${col} + ${TZ_SQL})::date`;
const KIND: Record<string, string> = { signal: "Signal", closed: "Yopildi", error: "Xato", demo: "Demo" };
const r2 = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}`;
const cls = (x: number | null) => (x == null ? "" : x >= 0 ? "up" : "down");

type Day = { d: string; decisions: string; trades: string; demo: string; pnl: number | null; events: string };
type Dec = { id: number; at: Date; pair: string; mode: string; action: string; confidence: number; status: string; entry: number | null; result_r: number | null; reason: string; note: string };
type Demo = { id: number; opened_at: Date; closed_at: Date | null; pair: string; side: string; status: string; outcome: string | null; pnl: number | null; ai_trade_id: number | null };
type Ev = { id: number; at: Date; kind: string; pair: string | null; timeframe: string | null; message: string };

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  await requireAdmin();
  const q = await searchParams;
  const today = tashDay(Date.now());
  const days = await sql<Day>(
    `WITH d AS (
       SELECT ${DAY("at")} AS d FROM ai_trades UNION SELECT ${DAY("opened_at")} FROM demo_trades UNION SELECT ${DAY("at")} FROM robot_events
     )
     SELECT to_char(d.d, 'YYYY-MM-DD') AS d,
       (SELECT count(*) FROM ai_trades WHERE ${DAY("at")} = d.d) AS decisions,
       (SELECT count(*) FROM ai_trades WHERE ${DAY("at")} = d.d AND status NOT IN ('wait', 'rejected')) AS trades,
       (SELECT count(*) FROM demo_trades WHERE ${DAY("opened_at")} = d.d) AS demo,
       (SELECT sum(pnl) FROM demo_trades WHERE ${DAY("opened_at")} = d.d) AS pnl,
       (SELECT count(*) FROM robot_events WHERE ${DAY("at")} = d.d) AS events
     FROM d WHERE d.d < (now() + ${TZ_SQL})::date ORDER BY d.d DESC LIMIT 90`,
  );
  const sel = isDay(q.d) && q.d !== today ? q.d : days[0]?.d;
  const [decs, demo, events] = sel ? await Promise.all([
    sql<Dec>(`SELECT id, at, pair, mode, action, confidence, status, entry, result_r, reason, note FROM ai_trades WHERE ${DAY("at")} = $1::date ORDER BY at DESC`, [sel]),
    sql<Demo>(`SELECT id, opened_at, closed_at, pair, side, status, outcome, pnl, ai_trade_id FROM demo_trades WHERE ${DAY("opened_at")} = $1::date ORDER BY opened_at DESC`, [sel]),
    sql<Ev>(`SELECT * FROM robot_events WHERE ${DAY("at")} = $1::date ORDER BY at DESC`, [sel]),
  ]) : [[], [], []];
  const href = (d: string) => `${adminHref("/arxiv")}?d=${d}`;
  const tahlil = (id: number) => `${adminHref("/ai/tahlil")}?t=${id}`;

  return (
    <main className="wrap">
      <header className="page-head">
        <div>
          <h1>Kunlik arxiv</h1>
          <p className="sub">Oldingi kunlar (Toshkent vaqti): Claude tahlillari va qarorlari, ochilgan savdolar, demo natija va robot hodisalari. Bugungisi o&apos;z sahifalarida.</p>
        </div>
      </header>

      {days.length === 0 ? <p className="muted">Arxiv hali bo&apos;sh: oldingi kunlarda yozuv yo&apos;q.</p> : (
        <section className="panel">
          <h2>Kunlar</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Kun</th><th className="num">Claude qarorlari</th><th className="num">Savdoga kirgan</th><th className="num">Demo savdo</th><th className="num">Demo natija, USDT</th><th className="num">Hodisalar</th></tr></thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.d} className={d.d === sel ? "sel" : ""}>
                    <td>{d.d === sel ? <b>{d.d}</b> : <Link href={href(d.d)}>{d.d}</Link>}</td>
                    <td className="num">{d.decisions}</td>
                    <td className="num">{d.trades}</td>
                    <td className="num">{d.demo}</td>
                    <td className={`num ${cls(d.pnl == null ? null : Number(d.pnl))}`}>{d.pnl == null ? "—" : r2(Number(d.pnl))}</td>
                    <td className="num">{d.events}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {sel && (
        <>
          <section className="panel">
            <h2>{sel}: Claude tahlillari va qarorlari ({decs.length})</h2>
            {decs.length === 0 ? <p className="muted">Bu kunda qaror yo&apos;q.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Vaqt</th><th>Juftlik</th><th>Qaror</th><th>Holat</th><th className="num">R</th><th>Sabab</th><th /></tr></thead>
                  <tbody>
                    {decs.map((t) => (
                      <tr key={t.id}>
                        <td><LocalTime at={t.at} /></td>
                        <td>{t.pair}{t.mode === "swing" ? " · swing" : ""}</td>
                        <td className={t.action === "BUY" ? "up" : t.action === "SELL" ? "down" : ""}>{t.action}{t.confidence ? ` ${t.confidence}%` : ""}</td>
                        <td>{t.status}</td>
                        <td className={`num ${cls(t.result_r == null ? null : Number(t.result_r))}`}>{t.result_r == null ? "—" : r2(Number(t.result_r))}</td>
                        <td className="muted" style={{ minWidth: 260, whiteSpace: "normal" }}>{t.note || t.reason}</td>
                        <td><Link href={tahlil(t.id)}>Tahlil →</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>{sel}: demo savdolar ({demo.length})</h2>
            {demo.length === 0 ? <p className="muted">Bu kunda demo savdo ochilmagan.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Ochilgan</th><th>Yopilgan</th><th>Juftlik</th><th>Yo&apos;nalish</th><th>Natija</th><th className="num">USDT</th><th /></tr></thead>
                  <tbody>
                    {demo.map((t) => (
                      <tr key={t.id}>
                        <td><LocalTime at={t.opened_at} /></td>
                        <td>{t.closed_at ? <LocalTime at={t.closed_at} /> : "ochiq"}</td>
                        <td>{t.pair}{t.ai_trade_id ? " · Claude" : " · Zeus"}</td>
                        <td className={t.side === "BUY" ? "up" : "down"}>{t.side}</td>
                        <td>{t.outcome ?? t.status}</td>
                        <td className={`num ${cls(t.pnl == null ? null : Number(t.pnl))}`}>{t.pnl == null ? "—" : r2(Number(t.pnl))}</td>
                        <td>{t.ai_trade_id ? <Link href={tahlil(t.ai_trade_id)}>Tahlil →</Link> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>{sel}: hodisalar ({events.length})</h2>
            {events.length === 0 ? <p className="muted">Bu kunda hodisa yo&apos;q.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Vaqt</th><th>Tur</th><th>Juftlik</th><th>TF</th><th>Tafsilot</th></tr></thead>
                  <tbody>
                    {events.map((e) => (
                      <tr key={e.id}>
                        <td><LocalTime at={e.at} /></td>
                        <td><span className={`pill ${e.kind === "error" ? "sl" : e.kind === "signal" ? "active" : "tp1"}`}>{KIND[e.kind] ?? e.kind}</span></td>
                        <td>{e.pair}</td>
                        <td>{e.timeframe}</td>
                        <td style={{ whiteSpace: "normal" }}>{e.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
