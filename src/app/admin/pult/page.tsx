import Link from "next/link";
import { adminHref } from "@/lib/adminPath.ts";
import { analyze } from "@/lib/engine.ts";
import { ema } from "@/lib/indicators.ts";
import { activeInstruments } from "@/lib/instruments.ts";
import { getCandles } from "@/lib/market.ts";
import { marketOpen, nextOpen } from "@/lib/sessions.ts";
import { CONTEXT_TFS, TIMEFRAMES, type Instrument, type Timeframe } from "@/lib/types.ts";
import { gated } from "@/lib/server/aiReview.ts";
import { latestView } from "@/lib/server/aiView.ts";
import { digitsOf } from "@/lib/server/analysis.ts";
import { requireAdmin } from "@/lib/server/auth.ts";
import { sql } from "@/lib/server/db.ts";
import AutoRefresh from "../../components/AutoRefresh.tsx";
import Countdown from "../../components/Countdown.tsx";
import LocalTime from "../../components/LocalTime.tsx";
import type { ChartLevel, ChartSignal } from "../../components/RobotChart.tsx";
import TvChart from "../../components/TvChart.tsx";

export const metadata = { title: "Signal pulti", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Signal pulti: oltin va barcha valyutalar bir sahifada. Texnik tahlil, aniq signal (kirish, SL, TP1, TP2),
// kirishgacha taymer va tanlangan juftlik grafigi (Claude darajalari va zonalari bilan). Faqat admin.

const TF_MIN: Record<string, number> = { M5: 5, M15: 15, M30: 30, H1: 60 };
const ENTRY_WINDOW_MIN = 20; // MT5 EA bilan bir xil: tayyor bo'lgach shuncha daqiqa ichida kirish mumkin
const TREND: Record<string, string> = { up: "↑", down: "↓", flat: "→" };
const TREND_WORD: Record<string, string> = { up: "yuqoriga", down: "pastga", flat: "yon" };

type Sig = {
  id: number; pair: string; timeframe: string; side: "BUY" | "SELL"; entry: number; sl: number; tp1: number; tp2: number;
  signal_time: Date; strategy: string; rating: string | null; confidence: number; ai_verdict: string | null; ai_at: Date | null;
};
type State = { pair: string; timeframe: string; side: string | null; quality: string | null; status: string | null; reason: string };

async function techOf(inst: Instrument) {
  const candles = await getCandles(inst, 15, 260);
  return { candles, a: analyze(candles.slice(-200)) };
}

export default async function PultPage({ searchParams }: { searchParams: Promise<{ pair?: string }> }) {
  await requireAdmin();
  const q = await searchParams;
  const list = activeInstruments().filter((i) => i.category !== "crypto");
  const pairs = list.map((i) => i.pair);
  const [sigs, states, ctx, techs, views, aiOpen] = await Promise.all([
    sql<Sig>(
      `SELECT id, pair, timeframe, side, entry, sl, tp1, tp2, signal_time, strategy, rating, confidence, ai_verdict, ai_at
       FROM signal_log WHERE status = 'active' AND pair = ANY($1) AND signal_time > now() - interval '8 hours'
       ORDER BY signal_time DESC`, [pairs],
    ),
    sql<State>("SELECT pair, timeframe, side, quality, status, reason FROM robot_state WHERE pair = ANY($1)", [pairs]),
    sql<{ pair: string; timeframe: string; trend: string }>("SELECT pair, timeframe, trend FROM market_context WHERE pair = ANY($1)", [pairs]),
    Promise.all(list.map((i) => techOf(i).catch(() => null))),
    Promise.all(pairs.map((p) => latestView(p).catch(() => null))),
    sql<{ id: number; pair: string; action: string; entry: number; sl: number; tp1: number; tp2: number; status: string; at: Date; confidence: number; mode: string }>(
      "SELECT id, pair, action, entry, sl, tp1, tp2, status, at, confidence, mode FROM ai_trades WHERE status IN ('open', 'tp1') AND pair = ANY($1)", [pairs],
    ),
  ]);
  const now = Date.now();
  const rows = list.map((inst, k) => {
    const s = sigs.filter((x) => x.pair === inst.pair).sort((a, b) => (b.strategy === "trend" ? 1 : 0) - (a.strategy === "trend" ? 1 : 0))[0] ?? null;
    return { inst, sig: s, tech: techs[k], view: views[k], st: states.filter((x) => x.pair === inst.pair), ctx: ctx.filter((x) => x.pair === inst.pair) };
  });
  const sel = rows.find((r) => r.inst.pair === q.pair) ?? rows.find((r) => r.sig) ?? rows[0];
  const href = (p: string) => `${adminHref("/pult")}?pair=${encodeURIComponent(p)}#grafik`;

  return (
    <main className="wrap">
      <AutoRefresh seconds={300} />
      <header className="page-head">
        <div>
          <h1>Signal pulti</h1>
          <p className="sub">Oltin va valyutalar bir joyda: texnik tahlil, aniq signal (kirish, SL, TP1, TP2) va kirishgacha taymer. Sahifa har 5 daqiqada yangilanadi, taymer har soniyada. Faqat admin.</p>
        </div>
      </header>

      <div className="pult-grid">
        {rows.map(({ inst, sig, tech, view, st, ctx: c }) => {
          const d = digitsOf(inst.pair, tech?.a?.close ?? 0);
          const f = (v: number) => Number(v).toFixed(d);
          const open = marketOpen(inst.category, now);
          const a = tech?.a;
          return (
            <section key={inst.pair} className={`panel pult-card ${sig ? (sig.side === "BUY" ? "buy" : "sell") : ""}`}>
              <div className="bar">
                <h2 style={{ margin: 0 }}>{inst.pair}</h2>
                <span className="muted">{a ? f(a.close) : "—"} · {open ? "bozor ochiq" : "bozor yopiq"}</span>
              </div>

              <Timer sig={sig} category={inst.category} now={now} />

              {sig ? <SignalBox sig={sig} f={f} /> : <p className="muted" style={{ margin: 0 }}>Hozir faol signal yo&apos;q. Robot shartlar mos kelishini kutmoqda.</p>}

              <div className="pult-tech">
                <span>M15 trend <b className={a?.trend === "up" ? "up" : a?.trend === "down" ? "down" : ""}>{a ? `${TREND[a.trend]} ${TREND_WORD[a.trend]}` : "—"}</b></span>
                <span>ADX <b>{a ? Math.round(a.adx) : "—"}</b>{a && a.adx < 20 ? " (kuchsiz)" : ""}</span>
                <span>RSI <b>{a ? Math.round(a.rsi) : "—"}</b>{a && a.rsi >= 70 ? " (qizigan)" : a && a.rsi <= 30 ? " (sovigan)" : ""}</span>
                <span>ATR <b>{a ? f(a.atr) : "—"}</b></span>
                <span>EMA20 <b>{a ? f(a.ema20) : "—"}</b></span>
                <span>EMA50 <b>{a ? f(a.ema50) : "—"}</b></span>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                Katta trend: {CONTEXT_TFS.map((k) => `${k} ${TREND[c.find((x) => x.timeframe === k)?.trend ?? ""] ?? "—"}`).join(" · ")}
              </p>
              <p className="muted" style={{ margin: 0 }}>
                Robot: {TIMEFRAMES.map((t: Timeframe) => {
                  const s = st.find((x) => x.timeframe === t);
                  return `${t} ${s?.side && s.status === "active" ? `${s.quality === "strong" ? "kuchli" : "kuchsiz"} ${s.side}` : "kutmoqda"}`;
                }).join(" · ")}
              </p>
              {aiOpen.filter((t) => t.pair === inst.pair).map((t) => (
                <p key={t.id} style={{ margin: 0 }}>
                  Claude {t.mode === "swing" ? "swing, 3-5 kun" : "treyder"} (demo): <b className={t.action === "BUY" ? "up" : "down"}>{t.action}</b> {f(t.entry)} · SL {f(t.sl)} · TP1 {f(t.tp1)} · TP2 {f(t.tp2)}
                  {t.status === "tp1" ? " · TP1 urildi" : ""} · <Link href={`${adminHref("/ai/tahlil")}?t=${t.id}`}>tahlil</Link>
                </p>
              ))}
              {view ? (
                <p style={{ margin: 0 }}>
                  Claude: <b className={view.bias === "BUY" ? "up" : view.bias === "SELL" ? "down" : ""}>{view.bias === "WAIT" ? "kutish" : view.bias}</b>
                  {` · ${view.confidence}%`}{view.agree ? ` · robot bilan ${view.agree}` : ""} <span className="muted">(<LocalTime at={view.at} />)</span>
                </p>
              ) : <p className="muted" style={{ margin: 0 }}>Claude tahlili hali yo&apos;q.</p>}
              <div className="chips">
                <Link href={href(inst.pair)} aria-current={sel.inst.pair === inst.pair}>Grafik</Link>
                {sig && <Link href={`${adminHref("/ai/tahlil")}?s=${sig.id}`}>To&apos;liq tahlil</Link>}
              </div>
            </section>
          );
        })}
      </div>

      <SelectedChart row={sel} />
    </main>
  );
}

// Taymer: signal bo'lsa kirishgacha yoki kirish oynasi tugashigacha; bo'lmasa keyingi tekshiruv yoki bozor ochilishigacha.
function Timer({ sig, category, now }: { sig: Sig | null; category: string; now: number }) {
  if (!marketOpen(category, now)) {
    return <div className="pult-timer"><span>Bozor ochilishigacha</span><Countdown to={nextOpen(category, now)} done="ochildi" /></div>;
  }
  if (sig) {
    const g = gated(sig.pair, sig.strategy);
    if (g && !sig.ai_verdict) return <div className="pult-timer wait"><span>Claude tekshirmoqda, kirmang</span><span className="timer">…</span></div>;
    if (g && sig.ai_verdict !== "tasdiq") return <div className="pult-timer no"><span>Claude ushlab qoldi, kirmang</span><span className="timer">✕</span></div>;
    const ready = Math.max(new Date(sig.signal_time).getTime() + (TF_MIN[sig.timeframe] ?? 15) * 60_000, sig.ai_at ? new Date(sig.ai_at).getTime() : 0);
    const until = ready + ENTRY_WINDOW_MIN * 60_000;
    if (now < ready) return <div className="pult-timer wait"><span>Kirishgacha</span><Countdown to={ready} done="kirish mumkin" /></div>;
    if (now < until) return <div className="pult-timer go"><span>Kirish mumkin, oyna yopilishiga</span><Countdown to={until} done="kech" /></div>;
    return <div className="pult-timer no"><span>Kirish oynasi o&apos;tdi: yangi kirish kech, ochiqlarni boshqaring</span><span className="timer">—</span></div>;
  }
  const step = 15 * 60_000;
  const next = Math.ceil(now / step) * step;
  return <div className="pult-timer"><span>Keyingi M15 sham yopilishi (robot tekshiradi)</span><Countdown to={next} done="tekshirilmoqda" /></div>;
}

function SignalBox({ sig, f }: { sig: Sig; f: (v: number) => string }) {
  const risk = Math.abs(sig.entry - sig.sl);
  const r = (v: number) => (risk ? (Math.abs(v - sig.entry) / risk).toFixed(1) : "—");
  const g = gated(sig.pair, sig.strategy);
  return (
    <div className="pult-signal">
      <div className="bar">
        <b className={sig.side === "BUY" ? "up" : "down"} style={{ fontSize: "1.2rem" }}>{sig.side} {sig.timeframe}</b>
        <span className="muted">
          <LocalTime at={sig.signal_time} withDate={false} />{sig.rating ? ` · reyting ${sig.rating}` : ""} · Zeus {sig.confidence}%
          {sig.ai_verdict ? ` · Claude: ${sig.ai_verdict}` : g ? " · Claude kutilmoqda" : ""}
          {!g ? " · admin sinovi" : ""}
        </span>
      </div>
      <table className="pult-levels">
        <tbody>
          <tr><th>Kirish</th><td>{f(sig.entry)}</td><td /></tr>
          <tr><th>SL</th><td className="down">{f(sig.sl)}</td><td className="muted">−1R ({f(risk)})</td></tr>
          <tr><th>TP1</th><td className="up">{f(sig.tp1)}</td><td className="muted">+{r(sig.tp1)}R, yarmi yopiladi</td></tr>
          <tr><th>TP2</th><td className="up">{f(sig.tp2)}</td><td className="muted">+{r(sig.tp2)}R</td></tr>
        </tbody>
      </table>
    </div>
  );
}

async function SelectedChart({ row }: { row: { inst: Instrument; sig: Sig | null; tech: Awaited<ReturnType<typeof techOf>> | null; view: Awaited<ReturnType<typeof latestView>> } }) {
  const { inst, sig, tech, view } = row;
  if (!tech?.candles.length) return <section className="panel" id="grafik"><h2>{inst.pair}</h2><p className="err">Narx ma&apos;lumotini olib bo&apos;lmadi.</p></section>;
  const all = tech.candles;
  const closes = all.map((c) => c.c);
  const e20 = ema(closes, 20), e50 = ema(closes, 50);
  const from = Math.max(0, all.length - 160);
  const signals: ChartSignal[] = sig ? [{ t: new Date(sig.signal_time).getTime(), side: sig.side, entry: +sig.entry, sl: +sig.sl, tp1: +sig.tp1, tp2: +sig.tp2, status: "active", label: `Zeus ${sig.side}` }] : [];
  const ca = view?.analysis ?? null;
  const levels: ChartLevel[] = [...(ca?.levels ?? [])];
  if (ca?.invalidation) levels.push({ price: ca.invalidation, kind: "invalidation", note: "Claude: g'oya shu narxda bekor" });
  return (
    <section className="panel" id="grafik">
      <div className="bar">
        <h2 style={{ margin: 0 }}>{inst.pair} · M15 grafik</h2>
        <Link className="muted" href={`${adminHref("/tahlil")}?pair=${encodeURIComponent(inst.pair)}&tf=M15`}>Boshqa taymfreymlar →</Link>
      </div>
      <TvChart candles={all.slice(from)} ema20={e20.slice(from)} ema50={e50.slice(from)} signals={signals} digits={digitsOf(inst.pair, closes.at(-1) ?? 0)}
        tfMinutes={15} levels={levels} zones={ca?.zones ?? []} />
      {view?.summary && <p className="ai-box" style={{ margin: 0 }}>Claude: {view.summary}</p>}
    </section>
  );
}
