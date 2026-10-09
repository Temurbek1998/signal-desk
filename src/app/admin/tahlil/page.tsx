import Link from "next/link";
import { adminHref } from "@/lib/adminPath.ts";
import { activeInstruments } from "@/lib/instruments.ts";
import { CONTEXT_TFS, TIMEFRAMES, type Timeframe } from "@/lib/types.ts";
import { runRobotNow } from "../../actions.ts";
import AiAnalysisView from "../../components/AiAnalysisView.tsx";
import ClaudeViewButton from "../../components/ClaudeViewButton.tsx";
import AutoRefresh from "../../components/AutoRefresh.tsx";
import LocalTime from "../../components/LocalTime.tsx";
import RobotChart, { type ChartLevel } from "../../components/RobotChart.tsx";
import RunNowButton from "../../components/RunNowButton.tsx";
import { requireAdmin } from "@/lib/server/auth.ts";
import { chartData } from "@/lib/server/analysis.ts";
import { provider } from "@/lib/server/llm.ts";
import { latestView } from "@/lib/server/aiView.ts";

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
  const view = await latestView(pair).catch(() => null);
  const ca = view?.analysis ?? null;
  const levels: ChartLevel[] = [...(ca?.levels ?? [])];
  if (ca?.invalidation) levels.push({ price: ca.invalidation, kind: "invalidation", note: "Claude: g'oya shu narxda bekor" });
  const robotHere = d?.states.find((x) => x.timeframe === tf);
  const fmt = (v: number | undefined | null) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d?.digits ?? 2));

  return (
    <main className="wrap">
      <AutoRefresh seconds={60} />
      <header className="page-head">
        <div>
          <h1>Robot + Claude tahlili</h1>
          <p className="sub">Robot (Zeus) hisoblaydi, Claude tushunadi: grafikda robot signallari va Claude chizgan zonalar, darajalar birga ko'rinadi.</p>
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
          <RobotChart candles={d.candles} ema20={d.ema20} ema50={d.ema50} signals={d.signals} digits={d.digits} tfMinutes={d.minutes}
            levels={levels} zones={ca?.zones ?? []} />
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
        <div className="bar">
          <h2>Robot va Claude birgalikda</h2>
          <ClaudeViewButton pair={pair} enabled={!!provider()} />
        </div>
        <div className="an-grid">
          <div>
            <h3 style={{ marginTop: 0 }}>Robot (Zeus), {tf}</h3>
            <p style={{ margin: 0 }}>
              {robotHere?.side && robotHere.status === "active"
                ? <b className={robotHere.side === "BUY" ? "up" : "down"}>{robotHere.quality === "strong" ? "Kuchli" : "Kuchsiz"} {robotHere.side}</b>
                : <b>Kutmoqda</b>}
            </p>
            <p className="muted">{robotHere?.reason ?? "Hali tahlil yo'q"}</p>
          </div>
          <div>
            <h3 style={{ marginTop: 0 }}>Claude</h3>
            {view ? (
              <>
                <p style={{ margin: 0 }}>
                  <b className={view.bias === "BUY" ? "up" : view.bias === "SELL" ? "down" : ""}>{view.bias === "WAIT" ? "Kutish" : view.bias}</b>
                  {` · ishonch ${view.confidence}%`}
                  {view.agree && <span className={`an-verdict ${view.agree === "rozi" ? "tasdiq" : view.agree === "qarshi" ? "ehtiyot" : ""}`} style={{ marginLeft: 8 }}>robot bilan {view.agree}</span>}
                </p>
                <p className="muted">Yangilangan <LocalTime at={view.at} /></p>
              </>
            ) : <p className="muted" style={{ margin: 0 }}>{provider() ? "Bu juftlik uchun hali Claude tahlili yo'q. Tugmani bosing." : "AI ulanmagan."}</p>}
          </div>
        </div>
        {view?.summary && <p className="ai-box" style={{ margin: 0 }}>{view.summary}</p>}
        <p className="muted" style={{ margin: 0 }}>Claude o&apos;zi yangilaydi: oltin har 2 soatda (AI treyder qarori bilan), valyutalar navbat bilan har 8 soatda, bozor ochiq paytda. Tugma bilan istalgan payt so&apos;rash mumkin. Faqat admin uchun.</p>
      </section>

      {ca && <AiAnalysisView a={ca} digits={d?.digits} />}

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

    </main>
  );
}
