import Link from "next/link";
import { adminHref } from "@/lib/adminPath.ts";
import { activeInstruments } from "@/lib/instruments.ts";
import { CONTEXT_TFS, TIMEFRAMES, type Timeframe } from "@/lib/types.ts";
import { runRobotNow } from "../../actions.ts";
import AiExplain from "../../components/AiExplain.tsx";
import AutoRefresh from "../../components/AutoRefresh.tsx";
import LocalTime from "../../components/LocalTime.tsx";
import RobotChart from "../../components/RobotChart.tsx";
import RunNowButton from "../../components/RunNowButton.tsx";
import { requireAdmin } from "@/lib/server/auth.ts";
import { chartData } from "@/lib/server/analysis.ts";
import { provider } from "@/lib/server/llm.ts";

export const metadata = { title: "Robot tahlili", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TREND: Record<string, string> = { up: "↑ yuqoriga", down: "↓ pastga", flat: "→ yon" };

export default async function AnalysisPage({ searchParams }: { searchParams: Promise<{ pair?: string; tf?: string }> }) {
  await requireAdmin();
  const q = await searchParams;
  const tf = (TIMEFRAMES.find((t) => t === q.tf) ?? "M15") as Timeframe;
  const href = (pair: string, t: string) => `${adminHref("/tahlil")}?pair=${encodeURIComponent(pair)}&tf=${t}`;
  let d: Awaited<ReturnType<typeof chartData>> | null = null;
  let error = "";
  try {
    d = await chartData(q.pair, tf);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }
  const pair = d?.inst.pair ?? q.pair ?? "XAU/USD";
  const a = d?.analysis;
  const fmt = (v: number | undefined | null) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d?.digits ?? 2));

  return (
    <main className="wrap">
      <AutoRefresh seconds={60} />
      <header className="page-head">
        <div>
          <h1>Robot tahlili</h1>
          <p className="sub">Robot bozorni qanday ko'ryapti: grafik, indikatorlar, har taymfreymdagi xulosasi va signallari.</p>
        </div>
        <form action={runRobotNow}><RunNowButton /></form>
      </header>

      <div className="chips" aria-label="Juftlik">
        {activeInstruments().map((i) => <Link key={i.pair} href={href(i.pair, tf)} aria-current={i.pair === pair}>{i.pair}</Link>)}
      </div>

      <section className="panel">
        <div className="bar">
          <h2>{pair} · {tf}</h2>
          <div className="chips" aria-label="Taymfreym">
            {TIMEFRAMES.map((t) => <Link key={t} href={href(pair, t)} aria-current={t === tf}>{t}</Link>)}
          </div>
        </div>
        {d ? (
          <RobotChart candles={d.candles} ema20={d.ema20} ema50={d.ema50} signals={d.signals} digits={d.digits} tfMinutes={d.minutes} />
        ) : (
          <p className="err">Narx ma'lumotini olib bo'lmadi: {error}</p>
        )}
        {a && (
          <div className="stats">
            <div className="stat"><b className={a.trend === "up" ? "up" : a.trend === "down" ? "down" : ""}>{TREND[a.trend]}</b><span>Trend (EMA20/EMA50)</span></div>
            <div className="stat"><b>{Math.round(a.adx)}</b><span>ADX: trend kuchi (20 dan yuqori kerak)</span></div>
            <div className="stat"><b>{Math.round(a.rsi)}</b><span>RSI: 70+ qizigan, 30− sovigan</span></div>
            <div className="stat"><b>{fmt(a.atr)}</b><span>ATR: o'rtacha sham hajmi</span></div>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Robot xulosasi har taymfreymda</h2>
        <div className="tf-cards">
          {TIMEFRAMES.map((t) => {
            const s = d?.states.find((x) => x.timeframe === t);
            const live = s?.side && s.status === "active";
            return (
              <Link key={t} href={href(pair, t)} className={`tf-card ${live && s!.quality === "strong" ? "strong" : ""}`} style={{ textDecoration: "none", color: "inherit" }}>
                <div className="top">
                  <b>{t}</b>
                  {live ? <span className={`side ${s!.side === "BUY" ? "buy" : "sell"}`}>{s!.quality === "strong" ? "Kuchli" : "Kuchsiz"} {s!.side}</span> : <span className="side none">Kutmoqda</span>}
                </div>
                <span>{s?.reason ?? "Hali tahlil yo'q"}</span>
                {s && <span className="muted">Yangilangan <LocalTime at={s.updated_at} withDate={false} />{s.confidence ? ` · ishonch ${s.confidence}%` : ""}</span>}
              </Link>
            );
          })}
        </div>
        {d && d.context.length > 0 && (
          <p className="muted" style={{ margin: 0 }}>
            Katta trend: {CONTEXT_TFS.map((k) => `${k} ${TREND[d!.context.find((c) => c.timeframe === k)?.trend ?? ""] ?? "—"}`).join(" · ")}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Faol signallar</h2>
        {d && d.signals.some((s) => s.status === "active") ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vaqt</th><th>Yo'nalish</th><th className="num">Kirish</th><th className="num">TP 1</th><th className="num">TP 2</th><th className="num">SL</th></tr></thead>
              <tbody>
                {d.signals.filter((s) => s.status === "active").map((s) => (
                  <tr key={s.t}>
                    <td><LocalTime at={s.t} /></td>
                    <td className={s.side === "BUY" ? "up" : "down"}>{s.label}</td>
                    <td className="num">{fmt(s.entry)}</td><td className="num">{fmt(s.tp1)}</td><td className="num">{fmt(s.tp2)}</td><td className="num">{fmt(s.sl)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Bu juftlik va taymfreymda hozir ochiq signal yo'q. Robot shartlar mos kelishini kutmoqda.</p>
        )}
      </section>

      <section className="panel">
        <h2>AI izohi</h2>
        <AiExplain pair={pair} tf={tf} enabled={!!provider()} />
      </section>
    </main>
  );
}
