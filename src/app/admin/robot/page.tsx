import Link from "next/link";
import { adminHref } from "@/lib/adminPath.ts";
import { activeCategories, activeInstruments } from "@/lib/instruments.ts";
import { runRobotNow } from "../../actions.ts";
import AutoRefresh from "../../components/AutoRefresh.tsx";
import RunNowButton from "../../components/RunNowButton.tsx";
import LocalTime from "../../components/LocalTime.tsx";
import { requireAdmin } from "@/lib/server/auth.ts";
import { sql } from "@/lib/server/db.ts";
import { memoryTable } from "@/lib/server/memory.ts";
import { estimate, MIN_FOR_BLOCK } from "@/lib/memory.ts";
import { CONTEXT_TFS, TIMEFRAMES } from "@/lib/types.ts";

export const metadata = { title: "Robot", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const HEALTHY_MIN = 12; // oxirgi aylanish shundan eski bo'lsa robot to'xtagan hisoblanadi
const KIND: Record<string, string> = { signal: "Signal", closed: "Yopildi", error: "Xato", demo: "Demo" };

type Run = { id: number; started_at: Date; finished_at: Date; trigger: string; analyzed: number; failed: number; strong: number; weak: number; errors: string };
type State = { pair: string; timeframe: string; updated_at: Date; side: string | null; quality: string | null; status: string | null; confidence: number; reason: string };
type Ev = { id: number; at: Date; kind: string; pair: string | null; timeframe: string | null; message: string };

const t = (d: Date) => new Date(d).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default async function RobotPage() {
  await requireAdmin();
  const [runs, states, events, [today], memory, ctx] = await Promise.all([
    sql<Run>("SELECT * FROM robot_runs ORDER BY started_at DESC LIMIT 30"),
    sql<State>("SELECT * FROM robot_state ORDER BY pair, timeframe"),
    sql<Ev>("SELECT * FROM robot_events ORDER BY at DESC LIMIT 60"),
    sql<{ strong: string; closed: string; runs: string }>(
      `SELECT (SELECT count(*) FROM signal_log WHERE signal_time > now() - interval '24 hours') AS strong,
              (SELECT count(*) FROM signal_log WHERE status <> 'active' AND updated_at > now() - interval '24 hours') AS closed,
              (SELECT count(*) FROM robot_runs WHERE started_at > now() - interval '24 hours') AS runs`,
    ),
    memoryTable(),
    sql<{ pair: string; timeframe: string; trend: string; updated_at: Date }>("SELECT * FROM market_context"),
  ]);
  const last = runs[0];
  const ageMin = last ? (Date.now() - new Date(last.finished_at).getTime()) / 60_000 : Infinity;
  const healthy = ageMin <= HEALTHY_MIN;
  // Faqat hozir yoqilgan bozorlar (o'chirilgan juftliklarning eski holati ko'rsatilmaydi).
  const active = activeInstruments();
  const pairs = active.map((i) => i.pair).filter((p) => states.some((s) => s.pair === p));
  const goldSource = active.find((i) => i.category === "gold")?.source;
  const cell = (pair: string, tf: string) => states.find((s) => s.pair === pair && s.timeframe === tf);

  return (
    <main className="wrap">
      <AutoRefresh seconds={60} />
      <header className="page-head">
        <div>
          <h1>Robot logi</h1>
          <p className="sub">Robot nima qildi: aylanishlar, signal ochilishi va yopilishi, xatolar va xotira. Sahifa har daqiqada yangilanadi.</p>
        </div>
        <form action={runRobotNow}><RunNowButton /></form>
      </header>

      <p className={`notice ${healthy ? "" : "warn"}`}>
        {last
          ? healthy
            ? `Robot ishlayapti. Oxirgi aylanish ${Math.round(ageMin)} daqiqa oldin (${last.trigger}), ${last.analyzed} ta tahlil, ${last.failed} ta xato.`
            : `Robot ${Math.round(ageMin)} daqiqadan beri ishlamagan. Cron sozlamasini yoki serverni tekshiring.`
          : "Robot hali birorta ham aylanish qilmagan. Cron sozlang yoki \"Hozir ishga tushirish\" tugmasini bosing."}
      </p>

      <p className="muted">Kuzatilayotgan bozorlar: {activeCategories().map((c) => ({ gold: "oltin", forex: "valyuta", crypto: "kripto" })[c]).join(", ")} (ROBOT_MARKETS).</p>
      {goldSource === "yahoo" && (
        <p className="notice warn">
          Oltin narxi Yahoo'dagi GC=F fyuchersidan olinmoqda. U spot XAU/USD dan odatda bir necha o'n dollar farq qiladi, shuning
          uchun kirish, TP va SL darajalari brokerdagi narxga to'g'ri kelmaydi. TWELVEDATA_API_KEY ni qo'shing.
        </p>
      )}

      <div className="stats">
        <div className="stat"><b>{today.strong}</b><span>Kuchli signal, 24 soat</span></div>
        <div className="stat"><b>{today.closed}</b><span>Yopilgan signal, 24 soat</span></div>
        <div className="stat"><b>{today.runs}</b><span>Aylanishlar, 24 soat</span></div>
        <div className="stat"><b>{last ? `${last.strong} / ${last.weak}` : "—"}</b><span>Hozir faol: kuchli / kuchsiz</span></div>
      </div>

      <section className="panel">
        <h2>Robot xotirasi</h2>
        <p className="muted">
          So'nggi 60 kundagi yopilgan kuchli signallar. Robot har yangi signalga shu natijalar asosida reyting beradi:
          A (barcha tariflar), B (PRO va VIP), C (faqat admin). {MIN_FOR_BLOCK} tadan ko'p signalda yutuq 50% dan past bo'lsa
          juftlik vaqtincha bloklanadi.
        </p>
        {memory.length === 0 ? (
          <p className="muted">Xotira hali bo'sh: robot boshlang'ich baho sifatida tarixiy sinov natijasini (72%) ishlatadi.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Juftlik</th><th>TF</th><th className="num">Signallar</th><th className="num">Yutuq</th><th className="num">Kutilgan</th><th>Holat</th></tr></thead>
              <tbody>
                {memory.map((m) => {
                  const blocked = m.n >= MIN_FOR_BLOCK && m.wins / m.n < 0.5;
                  return (
                    <tr key={m.pair + m.timeframe}>
                      <td>{m.pair}</td>
                      <td>{m.timeframe}</td>
                      <td className="num">{m.n}</td>
                      <td className="num">{Math.round((m.wins / m.n) * 100)}%</td>
                      <td className="num">{Math.round(estimate(m) * 100)}%</td>
                      <td>{blocked ? <span className="pill sl">Bloklangan</span> : <span className="pill tp1">Faol</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Hodisalar</h2>
        {events.length === 0 ? (
          <p className="muted">Hali hodisa yo'q.</p>
        ) : (
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

      <section className="panel">
        <h2>Aylanishlar</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Boshlandi</th><th>Kim</th><th className="num">Davomiyligi</th><th className="num">Tahlil</th><th className="num">Xato</th><th className="num">Kuchli</th><th className="num">Kuchsiz</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} title={r.errors}>
                  <td><LocalTime at={r.started_at} /></td>
                  <td>{r.trigger}</td>
                  <td className="num">{((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime()) / 1000).toFixed(1)} s</td>
                  <td className="num">{r.analyzed}</td>
                  <td className={`num ${r.failed ? "down" : ""}`}>{r.failed}</td>
                  <td className="num">{r.strong}</td>
                  <td className="num">{r.weak}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
