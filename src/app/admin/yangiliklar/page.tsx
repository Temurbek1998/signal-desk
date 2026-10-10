import { ALL_INSTRUMENTS } from "@/lib/instruments.ts";
import { getM1 } from "@/lib/market.ts";
import { describe, getCalendar } from "@/lib/news.ts";
import { pipSize } from "@/lib/aiTrade.ts";
import { digitsOf } from "@/lib/server/analysis.ts";
import { newsBoard, newsEnabled, newsPairs, type NewsReaction } from "@/lib/server/newsTrader.ts";
import LiveRefresh from "../../components/LiveRefresh.tsx";
import LocalTime from "../../components/LocalTime.tsx";
import NewsNowButton from "../../components/NewsNowButton.tsx";
import TvChart from "../../components/TvChart.tsx";

export const metadata = { title: "Yangiliklar M1", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STATUS: Record<string, string> = { open: "Kuzatilmoqda", target: "Maqsad urildi", stop: "Bekor narxi urildi", expired: "Muddat tugadi", wait: "Yo'nalish yo'q", error: "Javob o'qilmadi" };
const sign = (x: number, d = 0) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}`;
const cls = (x: number | null) => (x == null ? "" : x >= 0 ? "up" : "down");

// Oxirgi reaksiya uchun M1 grafigi: chiqishdan 30 daqiqa oldin va keyingi shamlar (6 soatdan eski bo'lsa ko'rsatilmaydi).
async function chartFor(r: NewsReaction | undefined) {
  if (!r) return null;
  const t = new Date(r.event_time).getTime();
  if (Date.now() - t > 6 * 3600_000) return null;
  const inst = ALL_INSTRUMENTS.find((i) => i.pair === r.pair);
  if (!inst) return null;
  const m1 = await getM1(inst, Math.min(400, Math.ceil((Date.now() - t) / 60_000) + 30)).catch(() => []);
  if (!m1.length) return null;
  const price = Number(r.price);
  const dir = r.direction === "BUY" ? 1 : -1;
  const target = r.target_pips ? price + dir * Number(r.target_pips) * pipSize(r.pair) : price;
  return {
    candles: m1, digits: digitsOf(r.pair, price),
    signals: r.direction === "WAIT" ? [] : [{
      t: Math.floor(new Date(r.at).getTime() / 60_000) * 60_000, side: r.direction as "BUY" | "SELL", entry: price, tp1: target, tp2: target,
      sl: r.invalidation != null ? Number(r.invalidation) : price, status: r.status === "target" ? "tp2" : r.status === "stop" ? "sl" : "active", label: `${r.direction} yangilik`,
    }],
    levels: [{ price: Number(r.stats?.base ?? price), kind: "liquidity", note: "Chiqishdan oldingi narx" }],
  };
}

export default async function NewsPage() {
  const pairs = newsPairs();
  const [{ rows, stats }, calendar] = await Promise.all([newsBoard(30), getCalendar().catch(() => [])]);
  const now = Date.now();
  const upcoming = calendar.filter((e) => e.impact === "High" && e.time > now - 30 * 60_000 && e.time < now + 7 * 86_400_000 && e.pairs.some((p) => pairs.includes(p)));
  const chart = await chartFor(rows[0]);
  return (
    <main className="wrap">
      <LiveRefresh seconds={60} />
      <header className="page-head">
        <div>
          <h1>Yangiliklar M1</h1>
          <p className="sub">
            Kuchli yangilik (NFP, CPI, FOMC va boshqalar) chiqqach {pairs.join(", ")} ning M1 reaksiyasini Claude {process.env.NEWS_WAIT_MIN ?? 3} daqiqadan
            keyin tahlil qiladi: savdo yo&apos;nalishi, taxminiy pips maqsadi va bekor bo&apos;lish narxi. Natija shu yerda va Telegram&apos;da, keyin
            M1 bo&apos;yicha o&apos;lchanadi. Savdo ochilmaydi, mijozlarga chiqmaydi.
            {!newsEnabled() && <b className="down"> Hozir o&apos;chiq (AI ulanmagan yoki NEWS_AI=0).</b>}
          </p>
        </div>
        <NewsNowButton enabled={newsEnabled()} />
      </header>

      <section className="panel">
        <div className="stats">
          <div className="stat"><b>{stats.calls}</b><span>yo&apos;nalish berilgan, 30 kun</span></div>
          <div className="stat"><b>{stats.closed ? `${Math.round((stats.wins / stats.closed) * 100)}%` : "—"}</b><span>foydada yopilgan ({stats.wins}/{stats.closed})</span></div>
          <div className="stat"><b className={stats.closed ? cls(stats.pips) : ""}>{stats.closed ? sign(stats.pips) : "—"}</b><span>jami pips (tahlil narxidan)</span></div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Natija tahlil paytidagi narxdan hisoblanadi: maqsad urilsa maqsad pipsi, bekor narxi urilsa zarar, aks holda muddat oxiridagi narx.
          Oltinda 1 pip = 0.10 $. Bu taxmin, kafolat emas: 20-30 ta yangilikdan keyin natijaga qarab ishonish kerak.
        </p>
      </section>

      {chart && rows[0] && (
        <section className="panel">
          <h2>Oxirgi yangilik: {rows[0].events.map((e) => e.uz ?? e.title).join(", ")} · {rows[0].pair} M1</h2>
          <TvChart candles={chart.candles} ema20={[]} ema50={[]} signals={chart.signals} digits={chart.digits} levels={chart.levels} height={420} />
        </section>
      )}

      <section className="panel">
        <h2>Claude qarorlari</h2>
        {rows.length === 0 ? <p className="muted">Hali tahlil yo&apos;q. Keyingi kuchli yangilik chiqqach birinchi cron aylanishida paydo bo&apos;ladi.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Yangilik</th><th>Juftlik</th><th>Reaksiya</th><th>Qaror</th><th>Maqsad</th><th>Bekor</th><th>Natija</th><th>Sabab</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const d = digitsOf(r.pair, Number(r.price ?? 1));
                  const s = r.stats;
                  return (
                    <tr key={r.id}>
                      <td><LocalTime at={r.event_time} /><br />{r.events.map((e) => <span key={e.title}>{e.uz ?? e.title}<span className="muted"> ({e.forecast || "—"} / {e.previous || "—"})</span><br /></span>)}</td>
                      <td>{r.pair}<br /><span className="muted"><LocalTime at={r.at} withDate={false} /> da, {r.price != null ? Number(r.price).toFixed(d) : "—"}</span></td>
                      <td>{s ? <>1-daq <span className={cls(s.firstMinPips)}>{sign(s.firstMinPips)}</span><br />{s.minutes} daq <span className={cls(s.movePips)}>{sign(s.movePips)}</span><br /><span className="muted">↑{s.upPips.toFixed(0)} ↓{s.downPips.toFixed(0)}</span></> : "—"}</td>
                      <td className={r.direction === "BUY" ? "up" : r.direction === "SELL" ? "down" : "muted"}><b>{r.direction}</b>{r.confidence ? <span className="muted"> · {r.confidence}%</span> : null}</td>
                      <td>{r.target_pips ? <b>~{Number(r.target_pips).toFixed(0)} pips</b> : "—"}<br /><span className="muted">{r.horizon_min} daq{r.entry_note ? `, ${r.entry_note}` : ""}</span></td>
                      <td>{r.invalidation != null ? Number(r.invalidation).toFixed(d) : "—"}</td>
                      <td>{STATUS[r.status] ?? r.status}{r.result_pips != null ? <><br /><b className={cls(Number(r.result_pips))}>{sign(Number(r.result_pips))} pips</b></> : null}{r.mfe_pips != null && r.status !== "wait" ? <><br /><span className="muted">eng yaxshi +{Number(r.mfe_pips).toFixed(0)}, eng yomon −{Number(r.mae_pips ?? 0).toFixed(0)}</span></> : null}</td>
                      <td className="muted" style={{ minWidth: 280 }}>{r.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Kelayotgan kuchli yangiliklar (7 kun)</h2>
        {upcoming.length === 0 ? <p className="muted">Kalendarda kuchli yangilik yo&apos;q yoki kalendar olinmadi.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vaqt</th><th>Valyuta</th><th>Yangilik</th><th>Prognoz</th><th>Oldingi</th></tr></thead>
              <tbody>
                {upcoming.map((e) => (
                  <tr key={`${e.time}-${e.title}`}>
                    <td><LocalTime at={e.time} /></td><td>{e.currency}</td>
                    <td>{e.title}{describe(e.title) ? <><br /><span className="muted">{describe(e.title)}</span></> : null}</td>
                    <td>{e.forecast || "—"}</td><td>{e.previous || "—"}</td>
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
