import { ALL_INSTRUMENTS } from "@/lib/instruments.ts";
import { getM1 } from "@/lib/market.ts";
import { describe } from "@/lib/news.ts";
import { digitsOf } from "@/lib/server/analysis.ts";
import { newsPairs } from "@/lib/server/newsTrader.ts";
import { activeNews, impulseBoard, watchEnabled, windowMin } from "@/lib/server/newsWatch.ts";
import LiveRefresh from "../../components/LiveRefresh.tsx";
import LocalTime from "../../components/LocalTime.tsx";
import TvChart from "../../components/TvChart.tsx";

export const metadata = { title: "Yangilik impulslari", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const sign = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(0)}`;
const cls = (x: number | null) => (x == null ? "" : x >= 0 ? "up" : "down");

export default async function ImpulsePage() {
  const pairs = newsPairs();
  const [{ rows, ping }, { group, calendar }] = await Promise.all([impulseBoard(), activeNews().catch(() => ({ group: null, calendar: [] }))]);
  const now = Date.now();
  const imp = (process.env.NEWS_WATCH_IMPACT ?? "High,Medium").split(",").map((s) => s.trim());
  const upcoming = calendar.filter((e) => imp.includes(e.impact) && e.pairs.some((p) => pairs.includes(p)) && e.time > now && e.time < now + 36 * 3600_000);
  const pingAge = ping ? (now - new Date(ping.at).getTime()) / 60_000 : Infinity;

  // Kuzatuv paytida jonli M1 grafigi va topilgan impulslar.
  let chart: { pair: string; candles: Awaited<ReturnType<typeof getM1>>; digits: number } | null = null;
  const pair = pairs[0];
  const inst = ALL_INSTRUMENTS.find((i) => i.pair === pair);
  if (group && inst) {
    const m1 = await getM1(inst, 90).catch(() => []);
    if (m1.length) chart = { pair, candles: m1, digits: digitsOf(pair, m1.at(-1)!.c) };
  }
  const marks = chart ? rows.filter((r) => r.pair === chart!.pair && new Date(r.candle_time).getTime() >= chart!.candles[0].t).map((r) => ({
    t: new Date(r.candle_time).getTime(), side: r.side as "BUY" | "SELL", entry: Number(r.price), tp1: Number(r.price), tp2: Number(r.price), sl: Number(r.price),
    status: "active", label: `Impuls ${sign(r.side === "BUY" ? r.move_pips : -r.move_pips)}`,
  })) : [];

  return (
    <main className="wrap">
      <LiveRefresh seconds={30} />
      <header className="page-head">
        <div>
          <h1>Yangilik impulslari</h1>
          <p className="sub">
            Yangilik efiri boshlanganda ({pairs.join(", ")}) M1 har daqiqada kuzatiladi: chiqishdan 1 daqiqa oldin boshlab 20 daqiqa, nutqlarda 60 daqiqa.
            Ketma-ket 2-3 ta katta M1 sham bir tomonga ketsa (oltinda kamida {process.env.NEWS_IMPULSE_PIPS ?? 60} pips, shamlar odatdagidan 1.5x katta)
            darhol Telegram xabari va shu ro&apos;yxat. Oltin va valyutalarda haqiqiy hajm yo&apos;q: &quot;katta hajm&quot; o&apos;rniga sham kattaligi olinadi.
            Bu ogohlantirish, savdo ochilmaydi.
            {!watchEnabled() && <b className="down"> Hozir o&apos;chiq (NEWS_WATCH=0).</b>}
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="stats">
          <div className="stat">
            <b className={group ? "up" : undefined}>{group ? "Kuzatilmoqda" : "Kutish"}</b>
            <span>{group ? group.events.map((e) => describe(e.title) ?? e.title).join(", ") : "hozir yangilik oynasi yo'q"}</span>
          </div>
          <div className="stat">
            <b className={pingAge > 3 ? "down" : "up"}>{ping ? <LocalTime at={ping.at} withDate={false} /> : "—"}</b>
            <span>oxirgi tekshiruv{ping?.note ? `: ${ping.note}` : ""}</span>
          </div>
          <div className="stat"><b>{rows.filter((r) => now - new Date(r.at).getTime() < 7 * 86_400_000).length}</b><span>impuls, 7 kun</span></div>
        </div>
        {pingAge > 3 && (
          <p className="err" style={{ margin: 0 }}>
            Har daqiqalik tekshiruv ishlamayapti: cron-job.org da yangi vazifa qo&apos;shing, manzil <code>/api/news-watch</code>, har 1 daqiqada,
            sarlavha <code>Authorization: Bearer CRON_SECRET</code> (asosiy cron bilan bir xil). Usiz faqat har 5 daqiqada tekshiriladi.
          </p>
        )}
      </section>

      {chart && (
        <section className="panel">
          <h2>{chart.pair} M1, jonli</h2>
          <TvChart candles={chart.candles} ema20={[]} ema50={[]} signals={marks} digits={chart.digits} height={420} />
        </section>
      )}

      <section className="panel">
        <h2>Impulslar</h2>
        {rows.length === 0 ? <p className="muted">Hali impuls topilmagan.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vaqt</th><th>Yangilik</th><th>Juftlik</th><th>Yo&apos;nalish</th><th>Harakat</th><th>Narx</th><th>15 daqiqadan keyin</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const d = digitsOf(r.pair, Number(r.price));
                  return (
                    <tr key={r.id}>
                      <td><LocalTime at={r.candle_time} /></td>
                      <td>{r.events.map((e) => e.uz ?? e.title).join(", ")}<br /><span className="muted">chiqdi <LocalTime at={r.event_time} withDate={false} /></span></td>
                      <td>{r.pair}</td>
                      <td className={r.side === "BUY" ? "up" : "down"}><b>{r.side}</b></td>
                      <td><b>{sign(r.side === "BUY" ? r.move_pips : -r.move_pips)} pips</b><br /><span className="muted">{r.bars} daqiqa, {Number(r.range_x ?? 0).toFixed(1)}x</span></td>
                      <td>{Number(r.price).toFixed(d)}</td>
                      <td className={cls(r.after_pips == null ? null : Number(r.after_pips))}>{r.after_pips != null ? `${sign(Number(r.after_pips))} pips` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">&quot;15 daqiqadan keyin&quot;: narx impuls yo&apos;nalishida yana necha pips yurdi (manfiy bo&apos;lsa qaytgan).</p>
      </section>

      <section className="panel">
        <h2>Kuzatiladigan yangiliklar (36 soat)</h2>
        {upcoming.length === 0 ? <p className="muted">Kalendarda yangilik yo&apos;q yoki kalendar olinmadi.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vaqt</th><th>Ta&apos;sir</th><th>Valyuta</th><th>Yangilik</th><th>Kuzatuv</th></tr></thead>
              <tbody>
                {upcoming.map((e) => (
                  <tr key={`${e.time}-${e.title}`}>
                    <td><LocalTime at={e.time} /></td>
                    <td className={e.impact === "High" ? "down" : undefined}>{e.impact === "High" ? "Kuchli" : "O'rta"}</td>
                    <td>{e.currency}</td>
                    <td>{e.title}{describe(e.title) ? <><br /><span className="muted">{describe(e.title)}</span></> : null}</td>
                    <td>{windowMin(e)} daqiqa</td>
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
