import { getM1 } from "@/lib/market.ts";
import { digitsOf } from "@/lib/server/analysis.ts";
import { spikeBoard, spikeEnabled, spikePips, spikeSource } from "@/lib/server/spikeWatch.ts";
import LiveRefresh from "../../components/LiveRefresh.tsx";
import LocalTime from "../../components/LocalTime.tsx";
import TvChart from "../../components/TvChart.tsx";

export const metadata = { title: "Keskin harakatlar", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sign = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(0)}`;
const cls = (x: number | null) => (x == null ? "" : x >= 0 ? "up" : "down");
const cell = (x: number | null) => <td className={cls(x)}>{x != null ? sign(x) : "—"}</td>;

export default async function SpikePage() {
  const { rows, stats } = await spikeBoard();
  const { inst, label } = spikeSource();
  // Oxirgi harakat 3 soat ichida bo'lsa uning M1 grafigi.
  const last = rows[0];
  const lastT = last ? new Date(last.candle_time).getTime() : 0;
  let chart: { candles: Awaited<ReturnType<typeof getM1>>; digits: number } | null = null;
  if (last && Date.now() - lastT < 3 * 3600_000) {
    const m1 = await getM1(inst, Math.min(400, Math.ceil((Date.now() - lastT) / 60_000) + 40)).catch(() => []);
    if (m1.length) chart = { candles: m1, digits: digitsOf(last.pair, Number(last.price)) };
  }
  const marks = chart ? rows.filter((r) => new Date(r.candle_time).getTime() >= chart!.candles[0].t).map((r) => ({
    t: new Date(r.candle_time).getTime(), side: r.side as "BUY" | "SELL", entry: Number(r.price), tp1: Number(r.price), tp2: Number(r.price), sl: Number(r.price),
    status: "active", label: `${sign(r.side === "BUY" ? r.move_pips : -r.move_pips)} pips`,
  })) : [];

  return (
    <main className="wrap">
      <LiveRefresh seconds={30} />
      <header className="page-head">
        <div>
          <h1>Keskin harakatlar</h1>
          <p className="sub">
            Yangilikdan qat&apos;i nazar, oltin M1 har daqiqada tekshiriladi: 2-3 daqiqada {spikePips()} pips ({(spikePips() / 10).toFixed(0)} $) va undan ko&apos;p
            harakat bo&apos;lsa darhol Telegram xabari, bazaga yoziladi va keyingi 60 daqiqada qancha yurgani o&apos;lchanadi. Kuzatuv tugagach Claude qisqa xulosa yozadi.
            Manba: {label}. Savdo ochilmaydi.
            {!spikeEnabled() && <b className="down"> Hozir o&apos;chiq (SPIKE_WATCH=0).</b>}
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="stats">
          <div className="stat"><b>{stats.n}</b><span>harakat, 30 kun (kuzatuvi tugagan)</span></div>
          <div className="stat"><b>{stats.n ? `${Math.round((stats.cont / stats.n) * 100)}%` : "—"}</b><span>15 daqiqada shu tomonga davom etgan</span></div>
          <div className="stat"><b>{stats.avgMfe != null ? `+${stats.avgMfe.toFixed(0)}` : "—"}</b><span>o&apos;rtacha qo&apos;shimcha yurish, pips</span></div>
          <div className="stat"><b className={cls(stats.avg60)}>{stats.avg60 != null ? sign(stats.avg60) : "—"}</b><span>o&apos;rtacha 60 daqiqada, pips</span></div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Pips harakat oxiridagi narxdan, harakat yo&apos;nalishida: musbat bo&apos;lsa davom etgan, manfiy bo&apos;lsa qaytgan. Oltinda 1 pip = 0.10 $.
          Har daqiqalik tekshiruv uchun cron-job.org da <code>/api/news-watch</code> har 1 daqiqada bo&apos;lishi kerak, usiz har 5 daqiqada.
        </p>
      </section>

      {chart && (
        <section className="panel">
          <h2>Oxirgi harakat, M1</h2>
          <TvChart candles={chart.candles} ema20={[]} ema50={[]} signals={marks} digits={chart.digits} height={420} />
        </section>
      )}

      <section className="panel">
        <h2>Barcha harakatlar</h2>
        {rows.length === 0 ? <p className="muted">Hali keskin harakat bo&apos;lmagan.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vaqt</th><th>Harakat</th><th>Narx</th><th>Shu tomonga eng uzoq</th><th>Teskari</th><th>5 daq</th><th>15 daq</th><th>30 daq</th><th>60 daq</th><th>Claude xulosasi</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const d = digitsOf(r.pair, Number(r.price));
                  return (
                    <tr key={r.id}>
                      <td><LocalTime at={r.candle_time} />{r.news ? <><br /><span className="muted">{r.news}</span></> : null}</td>
                      <td className={r.side === "BUY" ? "up" : "down"}><b>{sign(r.side === "BUY" ? r.move_pips : -r.move_pips)} pips</b><br /><span className="muted">{r.bars} daqiqa, chekka {Number(r.peak_pips).toFixed(0)}</span></td>
                      <td>{Number(r.from_price).toFixed(d)} → {Number(r.price).toFixed(d)}</td>
                      <td className="up">{r.mfe_pips != null ? `+${Number(r.mfe_pips).toFixed(0)}` : "—"}</td>
                      <td className="down">{r.mae_pips != null ? `−${Number(r.mae_pips).toFixed(0)}` : "—"}</td>
                      {cell(r.after5 == null ? null : Number(r.after5))}{cell(r.after15 == null ? null : Number(r.after15))}
                      {cell(r.after30 == null ? null : Number(r.after30))}{cell(r.after60 == null ? null : Number(r.after60))}
                      <td className="muted" style={{ minWidth: 260 }}>{r.status === "tracking" ? `Kuzatilmoqda (${r.minutes} daqiqa)` : r.note || "Xulosa navbatda"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
