import { aiSummary, aiTraderEnabled } from "@/lib/server/aiTrader.ts";
import { chartData } from "@/lib/server/analysis.ts";
import { reviewStats } from "@/lib/server/aiReview.ts";
import { sql } from "@/lib/server/db.ts";
import { adminHref } from "@/lib/adminPath.ts";
import Link from "next/link";
import type { ChartSignal } from "../../components/RobotChart.tsx";
import AiDecideButton from "../../components/AiDecideButton.tsx";
import AutoRefresh from "../../components/AutoRefresh.tsx";
import LocalTime from "../../components/LocalTime.tsx";
import TvChart from "../../components/TvChart.tsx";

export const metadata = { title: "AI treyder", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const STATUS: Record<string, string> = {
  active: "Ochiq", close: "Vaqt bo'yicha yopildi", open: "Ochiq", tp1: "TP1 urildi, ochiq", tp2: "TP2 urildi", sl: "SL urildi", be: "TP1, so'ng kirishda yopildi",
  expired: "24 soatdan keyin yopildi", wait: "Kutish", rejected: "Rad etildi",
};
const r2 = (x: number) => `${x >= 0 ? "+" : ""}${x.toFixed(2)}R`;
const pct = (w: number, n: number) => (n ? `${Math.round((w / n) * 100)}%` : "—");

export default async function AiTraderPage() {
  const enabled = aiTraderEnabled();
  const [{ rows, ai, zeus }, chart, rev] = await Promise.all([
    aiSummary(30),
    chartData("XAU/USD", "H1", 120).catch(() => null),
    reviewStats().catch(() => []),
  ]);
  const zeusRows = await sql<{ id: number; pair: string; signal_time: Date; timeframe: string; side: string; status: string; result_r: number | null; ai_verdict: string | null; ai_confidence: number | null; ai_at: Date | null }>(
    `SELECT id, pair, signal_time, timeframe, side, status, result_r, ai_verdict, ai_confidence, ai_at FROM signal_log
     WHERE category IN ('gold', 'forex') AND coalesce(strategy, 'trend') = 'trend' ORDER BY signal_time DESC LIMIT 40`,
  ).catch(() => []);
  const byPair = await sql<{ pair: string; n: string; wins: string; total: number | null; ok_n: string; ok_total: number | null }>(
    `SELECT pair, count(*) AS n, count(*) FILTER (WHERE result_r > 0) AS wins, sum(result_r) AS total,
            count(*) FILTER (WHERE ai_verdict = 'tasdiq') AS ok_n, sum(result_r) FILTER (WHERE ai_verdict = 'tasdiq') AS ok_total
     FROM signal_log WHERE category IN ('gold', 'forex') AND coalesce(strategy, 'trend') = 'trend' AND status <> 'active'
       AND result_r IS NOT NULL AND signal_time > now() - interval '30 days'
     GROUP BY pair ORDER BY (pair = 'XAU/USD') DESC, sum(result_r) DESC`,
  ).catch(() => []);
  const detail = (k: "s" | "t", id: number) => `${adminHref("/ai/tahlil")}?${k}=${id}`;
  const revOf = (v: string) => {
    const r = rev.find((x) => x.verdict === v);
    const n = Number(r?.n ?? 0), w = Number(r?.wins ?? 0), t = Number(r?.total ?? 0);
    return { n, w, t };
  };
  const ok = revOf("tasdiq"), care = revOf("ehtiyot");
  const trades = rows.filter((r) => r.status !== "wait" && r.status !== "rejected");
  const since = chart?.candles[0]?.t ?? 0;
  const aiSignals: ChartSignal[] = trades
    .filter((t) => new Date(t.at).getTime() >= since || t.status === "open" || t.status === "tp1")
    .map((t) => ({
      t: Math.floor(new Date(t.at).getTime() / 3600_000) * 3600_000, side: t.action as "BUY" | "SELL",
      entry: Number(t.entry), tp1: Number(t.tp1), tp2: Number(t.tp2), sl: Number(t.sl),
      status: t.status === "open" || t.status === "tp1" ? "active" : t.status, label: `AI ${t.action}`,
    }));
  const latest = rows[0];
  return (
    <main className="wrap">
      <AutoRefresh seconds={60} />
      <header className="page-head">
        <div>
          <h1>AI treyder</h1>
          <p className="sub">Oltin (XAU/USD), faqat demo. AI har soatda bozorni o&apos;zi tahlil qiladi va BUY, SELL yoki kutish qaroriga keladi.</p>
        </div>
        <AiDecideButton enabled={enabled} />
      </header>

      {!enabled && (
        <section className="panel">
          <p className="err" style={{ margin: 0 }}>AI hali ulanmagan. Vercel&apos;da ANTHROPIC_API_KEY (yoki bepul GEMINI_API_KEY) qo&apos;shilsa, AI treyder o&apos;zi ishga tushadi.</p>
        </section>
      )}

      <section className="panel">
        <h2>AI va Zeus, so&apos;nggi 30 kun</h2>
        <div className="stats">
          <div className="stat"><b className={ai.totalR >= 0 ? "up" : "down"}>{ai.closed ? r2(ai.totalR) : "—"}</b><span>AI jami natija, {ai.closed} yopilgan savdo</span></div>
          <div className="stat"><b>{pct(ai.wins, ai.closed)}</b><span>AI yutuq ulushi, o&apos;rtacha {ai.closed ? r2(ai.avgR) : "—"}</span></div>
          <div className="stat"><b className={zeus.totalR >= 0 ? "up" : "down"}>{zeus.closed ? r2(zeus.totalR) : "—"}</b><span>Zeus jami natija (oltin), {zeus.closed} yopilgan</span></div>
          <div className="stat"><b>{pct(zeus.wins, zeus.closed)}</b><span>Zeus yutuq ulushi, o&apos;rtacha {zeus.closed ? r2(zeus.avgR) : "—"}</span></div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          R: risk birligi (−1 = to&apos;liq SL). Ikkalasi bir xil o&apos;lchanadi: TP1 da yarmi yopiladi, SL kirishga ko&apos;chadi.
          AI qarorlari mijozlarga chiqmaydi. Kamida 30 ta yopilgan savdoda Zeus&apos;dan yaxshi bo&apos;lsa, keyin mijozlarga ochish mumkin.
        </p>
      </section>

      <section className="panel">
        <h2>Zeus + Claude hamkorligi</h2>
        <p className="muted" style={{ margin: 0 }}>
          Zeus imkoniyat topadi, Claude uni mustaqil tahlil qilib yakuniy qaror chiqaradi: &quot;tasdiq&quot; bo&apos;lsa signal mijozlarga ochiladi,
          &quot;ehtiyot&quot; bo&apos;lsa ushlab qolinadi. Ushlab qolingan signallar ham kuzatiladi, shuning uchun Claude to&apos;g&apos;ri rad etyaptimi, quyida ko&apos;rinadi.
        </p>
        <div className="stats">
          <div className="stat"><b className={ok.t >= 0 ? "up" : "down"}>{ok.n ? r2(ok.t) : "—"}</b><span>Claude tasdiqlagan: {ok.n} yopilgan, yutuq {pct(ok.w, ok.n)}</span></div>
          <div className="stat"><b className={care.t >= 0 ? "up" : "down"}>{care.n ? r2(care.t) : "—"}</b><span>Claude ushlab qolgan: {care.n} yopilgan, yutuq {pct(care.w, care.n)}</span></div>
        </div>
      </section>

      {latest && (
        <section className="panel">
          <h2>Oxirgi qaror: {latest.action} · {STATUS[latest.status] ?? latest.status}</h2>
          <p className="muted" style={{ margin: 0 }}><LocalTime at={latest.at} />{latest.confidence ? ` · ishonch ${latest.confidence}%` : ""}{latest.model ? ` · ${latest.model}` : ""}</p>
          {latest.reason && <p className="ai-box">{latest.reason}</p>}
          <Link href={detail("t", latest.id)}>To&apos;liq tahlil va grafik →</Link>
          {latest.note && <p className="err">{latest.note}</p>}
        </section>
      )}

      {chart && (
        <section className="panel">
          <h2>Oltin H1 va AI savdolari</h2>
          <TvChart candles={chart.candles} ema20={chart.ema20} ema50={chart.ema50} signals={aiSignals} digits={chart.digits} tfMinutes={60} />
        </section>
      )}

      <section className="panel">
        <h2>Juftliklar bo&apos;yicha natija, 30 kun</h2>
        <p className="muted" style={{ marginTop: 0 }}>Valyuta mijozlarga ochilishi uchun: kamida 20 ta yopilgan signal va ijobiy jami natija (Claude tasdiqlaganlari bo&apos;yicha).</p>
        {byPair.length === 0 ? <p className="muted">Hali yopilgan signal yo&apos;q.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Juftlik</th><th>Yopilgan</th><th>Yutuq</th><th>Jami</th><th>Claude tasdiqlagan</th><th>Holat</th></tr></thead>
              <tbody>
                {byPair.map((p) => {
                  const n = Number(p.n), okN = Number(p.ok_n), okT = Number(p.ok_total ?? 0);
                  const ready = p.pair !== "XAU/USD" && okN >= 20 && okT > 0;
                  return (
                    <tr key={p.pair}>
                      <td>{p.pair}</td><td>{n}</td><td>{pct(Number(p.wins), n)}</td>
                      <td className={Number(p.total ?? 0) >= 0 ? "up" : "down"}>{r2(Number(p.total ?? 0))}</td>
                      <td className={okT >= 0 ? "up" : "down"}>{okN ? `${r2(okT)} (${okN})` : "—"}</td>
                      <td>{p.pair === "XAU/USD" ? "Mijozlarga ochiq" : ready ? "Ochishga tayyor" : "Sinovda"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Signallar: Zeus va Claude qarori</h2>
        <p className="muted" style={{ marginTop: 0 }}>Oltin mijozlarga Claude tasdig&apos;i bilan chiqadi. Valyutalar faqat admin uchun sinovda: foydasi isbotlangan juftliklar keyin ochiladi.</p>
        {zeusRows.length === 0 ? <p className="muted">Hali signal yo&apos;q.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vaqt</th><th>Signal</th><th>Claude</th><th>Holat</th><th>Natija</th><th /></tr></thead>
              <tbody>
                {zeusRows.map((r) => (
                  <tr key={r.id}>
                    <td><LocalTime at={r.signal_time} /></td>
                    <td className={r.side === "BUY" ? "up" : "down"}>{r.pair} {r.side} {r.timeframe}{r.pair !== "XAU/USD" ? " · sinov" : ""}</td>
                    <td>{r.ai_verdict ? <span className={`an-verdict ${r.ai_verdict}`}>{r.ai_verdict === "tasdiq" ? "tasdiq" : "ushlab qoldi"} {r.ai_confidence}%</span> : r.ai_at ? "tekshirmoqda" : "—"}</td>
                    <td>{STATUS[r.status] ?? r.status}</td>
                    <td className={r.result_r == null ? "" : Number(r.result_r) >= 0 ? "up" : "down"}>{r.result_r == null ? "—" : r2(Number(r.result_r))}</td>
                    <td><Link href={detail("s", r.id)}>Tahlil →</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>AI qarorlari jurnali</h2>
        {rows.length === 0 ? <p className="muted">Hali qaror yo&apos;q.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vaqt</th><th>Qaror</th><th>Kirish</th><th>SL</th><th>TP1</th><th>TP2</th><th>Holat</th><th>Natija</th><th>Sabab</th><th /></tr></thead>
              <tbody>
                {rows.slice(0, 60).map((t) => (
                  <tr key={t.id}>
                    <td><LocalTime at={t.at} /></td>
                    <td className={t.action === "BUY" ? "up" : t.action === "SELL" ? "down" : ""}>{t.action}{t.confidence ? ` ${t.confidence}%` : ""}</td>
                    <td>{t.entry != null ? Number(t.entry).toFixed(2) : "—"}</td>
                    <td>{t.action !== "WAIT" && t.sl ? Number(t.sl).toFixed(2) : "—"}</td>
                    <td>{t.action !== "WAIT" && t.tp1 ? Number(t.tp1).toFixed(2) : "—"}</td>
                    <td>{t.action !== "WAIT" && t.tp2 ? Number(t.tp2).toFixed(2) : "—"}</td>
                    <td>{STATUS[t.status] ?? t.status}</td>
                    <td className={t.result_r == null ? "" : Number(t.result_r) >= 0 ? "up" : "down"}>{t.result_r == null ? "—" : r2(Number(t.result_r))}</td>
                    <td className="muted" style={{ minWidth: 260 }}>{t.note || t.reason}</td>
                    <td><Link href={detail("t", t.id)}>Tahlil →</Link></td>
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
