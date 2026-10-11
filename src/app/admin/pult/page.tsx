import Link from "next/link";
import { adminHref } from "@/lib/adminPath.ts";
import { analyze } from "@/lib/engine.ts";
import { ema } from "@/lib/indicators.ts";
import { activeInstruments } from "@/lib/instruments.ts";
import { getCandles } from "@/lib/market.ts";
import { marketOpen, nextOpen } from "@/lib/sessions.ts";
import { CONTEXT_TFS, TIMEFRAMES, type Instrument, type Timeframe } from "@/lib/types.ts";
import { latestView } from "@/lib/server/aiView.ts";
import { digitsOf } from "@/lib/server/analysis.ts";
import { requireAdmin } from "@/lib/server/auth.ts";
import { sql } from "@/lib/server/db.ts";
import AutoRefresh from "../../components/AutoRefresh.tsx";
import Countdown from "../../components/Countdown.tsx";
import LocalTime from "../../components/LocalTime.tsx";
import type { ChartLevel, ChartSignal } from "../../components/RobotChart.tsx";
import TvChart from "../../components/TvChart.tsx";
import ClaudeViewButton from "../../components/ClaudeViewButton.tsx";
import { provider } from "@/lib/server/llm.ts";
import { everyMin } from "@/lib/server/aiTrader.ts";

export const metadata = { title: "Signal pulti", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Signal pulti: barcha yoqilgan bozorlar (oltin, valyuta, kripto) bir sahifada. Asosiy signal Claude treyderning qarori
// (v1.17.0 dan mijoz signali shu), Zeus qoidaviy signali faqat ma'lumot uchun. Keyingi Claude qarorigacha taymer,
// texnik ko'rsatkichlar va tanlangan juftlik jonli grafigi (Claude darajalari, zonalari, kirish/SL/TP bilan). Faqat admin.

const TF_MIN: Record<string, number> = { M15: 15, H1: 60, H4: 240 };
const TF_CANDLES: Record<string, number> = { M15: 260, H1: 200, H4: 120 };
const TREND: Record<string, string> = { up: "↑", down: "↓", flat: "→" };
const TREND_WORD: Record<string, string> = { up: "yuqoriga", down: "pastga", flat: "yon" };

type Sig = {
  id: number; pair: string; timeframe: string; side: "BUY" | "SELL"; entry: number; sl: number; tp1: number; tp2: number;
  signal_time: Date; strategy: string; rating: string | null; confidence: number; ai_verdict: string | null; ai_at: Date | null;
};
type Decision = { id: number; pair: string; action: string; entry: number | null; sl: number | null; tp1: number | null; tp2: number | null; status: string; at: Date; confidence: number; reason: string; mode: string };
type State = { pair: string; timeframe: string; side: string | null; quality: string | null; status: string | null; reason: string };

async function techOf(inst: Instrument, tfMin = 15) {
  const n = tfMin === 240 ? 120 : tfMin === 60 ? 200 : 260;
  const candles = await getCandles(inst, tfMin, n);
  return { candles, a: analyze(candles.slice(-200)) };
}

export default async function PultPage({ searchParams }: { searchParams: Promise<{ pair?: string; tf?: string }> }) {
  await requireAdmin();
  const q = await searchParams;
  const selTf = (TF_MIN[q.tf ?? ""] ? q.tf! : "M15") as keyof typeof TF_MIN;
  const selTfMin = TF_MIN[selTf];
  const ORDER: Record<string, number> = { gold: 0, forex: 1, crypto: 2 };
  const list = [...activeInstruments()].sort((x, y) => (ORDER[x.category] ?? 9) - (ORDER[y.category] ?? 9));
  const pairs = list.map((i) => i.pair);
  const [sigs, states, ctx, techs, views, aiOpen, lastDec] = await Promise.all([
    sql<Sig>(
      `SELECT id, pair, timeframe, side, entry, sl, tp1, tp2, signal_time, strategy, rating, confidence, ai_verdict, ai_at
       FROM signal_log WHERE status = 'active' AND pair = ANY($1) AND signal_time > now() - interval '8 hours'
       ORDER BY signal_time DESC`, [pairs],
    ),
    sql<State>("SELECT pair, timeframe, side, quality, status, reason FROM robot_state WHERE pair = ANY($1)", [pairs]),
    sql<{ pair: string; timeframe: string; trend: string }>("SELECT pair, timeframe, trend FROM market_context WHERE pair = ANY($1)", [pairs]),
    Promise.all(list.map((i) => techOf(i, selTfMin).catch(() => null))),
    Promise.all(pairs.map((p) => latestView(p).catch(() => null))),
    sql<{ id: number; pair: string; action: string; entry: number; sl: number; tp1: number; tp2: number; status: string; at: Date; confidence: number; mode: string }>(
      "SELECT id, pair, action, entry, sl, tp1, tp2, status, at, confidence, mode FROM ai_trades WHERE status IN ('open', 'tp1') AND pair = ANY($1) ORDER BY at DESC", [pairs],
    ),
    sql<Decision>(
      `SELECT DISTINCT ON (pair) id, pair, action, entry, sl, tp1, tp2, status, at, confidence, reason, mode FROM ai_trades
       WHERE pair = ANY($1) AND mode = 'intraday' ORDER BY pair, at DESC`, [pairs],
    ),
  ]);
  const now = Date.now();
  const rows = list.map((inst, k) => {
    const s = sigs.filter((x) => x.pair === inst.pair).sort((a, b) => (b.strategy === "trend" ? 1 : 0) - (a.strategy === "trend" ? 1 : 0))[0] ?? null;
    const claude = aiOpen.filter((t) => t.pair === inst.pair && t.mode === "intraday");
    return { inst, sig: s, claude, last: lastDec.find((d) => d.pair === inst.pair) ?? null, tech: techs[k], view: views[k], st: states.filter((x) => x.pair === inst.pair), ctx: ctx.filter((x) => x.pair === inst.pair) };
  });
  const sel = rows.find((r) => r.inst.pair === q.pair) ?? rows.find((r) => r.claude.length) ?? rows[0];
  const href = (p: string, tf?: string) => `${adminHref("/pult")}?pair=${encodeURIComponent(p)}${tf ? `&tf=${tf}` : selTf !== "M15" ? `&tf=${selTf}` : ""}#grafik`;

  return (
    <main className="wrap">
      <AutoRefresh seconds={300} />
      <header className="page-head">
        <div>
          <h1>Signal pulti</h1>
          <p className="sub">Barcha yoqilgan bozorlar bir joyda: Claude'ning ochiq savdolari (kirish, SL, TP1, TP2), oxirgi qarori va keyingi tahlilgacha taymer. Grafik jonli, sahifa har 5 daqiqada yangilanadi.</p>
        </div>
      </header>

      <div className="pult-grid">
        {rows.map(({ inst, sig, claude, last, tech, view, st, ctx: c }) => {
          const d = digitsOf(inst.pair, tech?.a?.close ?? 0);
          const f = (v: number) => Number(v).toFixed(d);
          const open = marketOpen(inst.category, now);
          const a = tech?.a;
          return (
            <section key={inst.pair} className={`panel pult-card ${claude[0] ? (claude[0].action === "BUY" ? "buy" : "sell") : ""}`}>
              <div className="bar">
                <h2 style={{ margin: 0 }}>{inst.pair}</h2>
                <span className="muted">{a ? f(a.close) : "—"} · {open ? "bozor ochiq" : "bozor yopiq"}</span>
              </div>

              <Timer open={claude.length > 0} last={last} pair={inst.pair} category={inst.category} now={now} />

              {claude.length ? claude.map((t) => <ClaudeBox key={t.id} t={t} f={f} />) : (
                <p className="muted" style={{ margin: 0 }}>Claude'da ochiq savdo yo&apos;q.</p>
              )}
              {last && (
                <p style={{ margin: 0 }}>
                  Oxirgi qaror: <b className={last.action === "BUY" ? "up" : last.action === "SELL" ? "down" : ""}>{last.action === "WAIT" ? "kutish" : last.action}</b>
                  {` · ${last.confidence}% · `}<LocalTime at={last.at} />{" · "}<Link href={`${adminHref("/ai/tahlil")}?t=${last.id}`}>tahlil</Link>
                  {last.reason && <><br /><span className="muted">{last.reason.split(/(?<=[.!?])\s+/).slice(0, 2).join(" ")}</span></>}
                </p>
              )}
              {sig && <p className="muted" style={{ margin: 0 }}>Zeus (qoidaviy robot, ma&apos;lumot uchun): {sig.side} {sig.timeframe} {f(sig.entry)} · SL {f(sig.sl)} · <Link href={`${adminHref("/ai/tahlil")}?s=${sig.id}`}>ko&apos;rish</Link></p>}

              <div className="pult-tech">
                <span title="M15 da EMA20 va EMA50 asosidagi trend yo'nalishi">
                  M15 trend <b className={a?.trend === "up" ? "up" : a?.trend === "down" ? "down" : ""}>{a ? `${TREND[a.trend]} ${TREND_WORD[a.trend]}` : "—"}</b>
                </span>
                <span title="ADX — trend kuchi. 20+ kuchli trend, 20 dan past yon bozor (signal zaif)">
                  ADX <b>{a ? Math.round(a.adx) : "—"}</b>
                  <span className="muted"> {a ? (a.adx >= 20 ? "kuchli" : "⚠ kuchsiz") : ""}</span>
                </span>
                <span title="RSI — qizib/sovib ketish ko'rsatkichi. 70+ = haddan tashqari o'sdi, 30− = haddan tashqari tushdi">
                  RSI <b>{a ? Math.round(a.rsi) : "—"}</b>
                  <span className="muted"> {a ? (a.rsi >= 70 ? "⚠ qizigan" : a.rsi <= 30 ? "⚠ sovigan" : "normal") : ""}</span>
                </span>
                <span title="ATR — o'rtacha sham balandligi (volatillik). SL va TP hisoblashda ishlatiladi">
                  ATR <b>{a ? f(a.atr) : "—"}</b>
                  <span className="muted"> (volatillik)</span>
                </span>
                <span title="EMA20 — so'nggi 20 sham o'rtachasi. Qisqa muddatli trend chizig'i (grafik sariq)">
                  EMA20 <b>{a ? f(a.ema20) : "—"}</b>
                  <span className="muted"> qisqa trend</span>
                </span>
                <span title="EMA50 — so'nggi 50 sham o'rtachasi. Uzun muddatli trend chizig'i (grafik ko'k)">
                  EMA50 <b>{a ? f(a.ema50) : "—"}</b>
                  <span className="muted"> uzun trend</span>
                </span>
              </div>
              <p className="muted" style={{ margin: 0 }}>
                Katta trend (yuqori taymfreymlar): {CONTEXT_TFS.map((k) => {
                  const t = c.find((x) => x.timeframe === k)?.trend;
                  return `${k} ${TREND[t ?? ""] ?? "—"}${t ? ` (${TREND_WORD[t]})` : ""}`;
                }).join(" · ")}
              </p>
              <p className="muted" style={{ margin: 0 }}>
                Robot: {TIMEFRAMES.map((t: Timeframe) => {
                  const s = st.find((x) => x.timeframe === t);
                  return `${t} ${s?.side && s.status === "active" ? `${s.quality === "strong" ? "kuchli" : "kuchsiz"} ${s.side}` : "kutmoqda"}`;
                }).join(" · ")}
              </p>
              {aiOpen.filter((t) => t.pair === inst.pair && t.mode === "swing").map((t) => (
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
                {last && <Link href={`${adminHref("/ai/tahlil")}?t=${last.id}`}>Claude tahlili</Link>}
              </div>
            </section>
          );
        })}
      </div>

      <SelectedChart row={sel} selTf={selTf} adminHref={adminHref("/pult")} />
    </main>
  );
}

// Taymer: bozor yopiq bo'lsa ochilishigacha; Claude'da ochiq savdo bo'lsa kuzatuv; aks holda keyingi Claude qarorigacha.
function Timer({ open, last, pair, category, now }: { open: boolean; last: Decision | null; pair: string; category: string; now: number }) {
  if (!marketOpen(category, now)) {
    return <div className="pult-timer"><span>Bozor ochilishigacha</span><Countdown to={nextOpen(category, now)} done="ochildi" /></div>;
  }
  if (open) return <div className="pult-timer go"><span>Savdo ochiq: Claude har soatda qayta ko&apos;radi</span><span className="timer">●</span></div>;
  const next = last ? new Date(last.at).getTime() + everyMin(pair) * 60_000 : now;
  return <div className="pult-timer"><span>Keyingi Claude tahlili</span><Countdown to={Math.max(next, now)} done="tahlil qilinmoqda" /></div>;
}

function ClaudeBox({ t, f }: { t: { id: number; action: string; entry: number; sl: number; tp1: number; tp2: number; status: string; at: Date; confidence: number }; f: (v: number) => string }) {
  const risk = Math.abs(t.entry - t.sl);
  const r = (v: number) => (risk ? (Math.abs(v - t.entry) / risk).toFixed(1) : "—");
  const rPips = f(risk);
  return (
    <div className="pult-signal">
      <div className="bar">
        <b className={t.action === "BUY" ? "up" : "down"} style={{ fontSize: "1.2rem" }}>
          Claude {t.action === "BUY" ? "✦ SOTIB OL" : "✦ SOT"}
        </b>
        <span className="muted"><LocalTime at={t.at} withDate={false} /> · ishonch {t.confidence}%{t.status === "tp1" ? " · TP1 urildi" : ""}</span>
      </div>
      <table className="pult-levels">
        <tbody>
          <tr>
            <th>Kirish narxi</th>
            <td>{f(t.entry)}</td>
            <td className="muted">— savdo shu narxda ochilgan</td>
          </tr>
          <tr>
            <th className="down">SL (stop loss)</th>
            <td className="down">{f(t.sl)}</td>
            <td className="muted">— zararga to&apos;xtash · {rPips} uzoqlikda</td>
          </tr>
          <tr>
            <th className="up">TP1 (1-maqsad)</th>
            <td className="up">{f(t.tp1)}</td>
            <td className="muted">— +{r(t.tp1)}R · yetganda yarmi yopiladi</td>
          </tr>
          <tr>
            <th className="up">TP2 (2-maqsad)</th>
            <td className="up">{f(t.tp2)}</td>
            <td className="muted">— +{r(t.tp2)}R · to&apos;liq chiqish{t.status === "tp1" ? " · SL hozir kirishda" : ""}</td>
          </tr>
        </tbody>
      </table>
      <p className="muted" style={{ margin: "0.25rem 0 0", fontSize: "0.8rem" }}>
        1R = {rPips} (kirish va SL orasidagi masofa). TP1 = {r(t.tp1)}×, TP2 = {r(t.tp2)}× xavfga nisbatan foyda.
      </p>
    </div>
  );
}

async function SelectedChart({ row, selTf, adminHref: base }: { row: { inst: Instrument; sig: Sig | null; claude: { action: string; entry: number; sl: number; tp1: number; tp2: number; at: Date }[]; tech: Awaited<ReturnType<typeof techOf>> | null; view: Awaited<ReturnType<typeof latestView>> }; selTf: string; adminHref: string }) {
  const { inst, claude, tech, view } = row;
  const tfMin = TF_MIN[selTf] ?? 15;
  const tfHref = (tf: string) => `${base}?pair=${encodeURIComponent(inst.pair)}&tf=${tf}#grafik`;
  if (!tech?.candles.length) return <section className="panel" id="grafik"><h2>{inst.pair}</h2><p className="err">Narx ma&apos;lumotini olib bo&apos;lmadi.</p></section>;
  const all = tech.candles;
  const closes = all.map((c) => c.c);
  const e20 = ema(closes, 20), e50 = ema(closes, 50);
  const from = Math.max(0, all.length - 160);
  const signals: ChartSignal[] = claude.map((t) => ({ t: new Date(t.at).getTime(), side: t.action as "BUY" | "SELL", entry: +t.entry, sl: +t.sl, tp1: +t.tp1, tp2: +t.tp2, status: "active", label: `Claude ${t.action}` }));
  const ca = view?.analysis ?? null;
  const levels: ChartLevel[] = [...(ca?.levels ?? [])];
  if (ca?.invalidation) levels.push({ price: ca.invalidation, kind: "invalidation", note: "Claude: g'oya shu narxda bekor" });
  return (
    <section className="panel" id="grafik">
      <div className="bar">
        <h2 style={{ margin: 0 }}>{inst.pair} · {selTf} grafik</h2>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {Object.keys(TF_MIN).map((tf) => (
            <Link key={tf} href={tfHref(tf)} className={`chip${tf === selTf ? " active" : ""}`} style={{ fontWeight: tf === selTf ? 600 : undefined }}>{tf}</Link>
          ))}
        </div>
      </div>
      <TvChart candles={all.slice(from)} ema20={e20.slice(from)} ema50={e50.slice(from)} signals={signals} digits={digitsOf(inst.pair, closes.at(-1) ?? 0)}
        tfMinutes={tfMin} levels={levels} zones={ca?.zones ?? []} live={{ pair: inst.pair, source: inst.source }} />
      {view ? view.summary && <p className="ai-box" style={{ margin: 0 }}>Claude tahlili xulosa: {view.summary}</p> : (
        <p className="muted" style={{ margin: 0 }}>Bu juftlikda Claude tahlili (zonalar, darajalar) hali yo&apos;q: cron navbat bilan chizadi yoki hozir so&apos;rang.</p>
      )}
      <div className="pult-legend">
        <span><span style={{ display: "inline-block", width: 12, height: 3, background: "#f59e0b", borderRadius: 2, verticalAlign: "middle", marginRight: 4 }} />EMA20 — qisqa muddatli trend (20 sham)</span>
        <span><span style={{ display: "inline-block", width: 12, height: 3, background: "#3b82f6", borderRadius: 2, verticalAlign: "middle", marginRight: 4 }} />EMA50 — uzun muddatli trend (50 sham)</span>
        <span><span style={{ color: "#22c55e", marginRight: 4 }}>▲</span>Yashil belgisi — Claude BUY kirish narxi</span>
        <span><span style={{ color: "#ef4444", marginRight: 4 }}>▼</span>Qizil belgisi — Claude SELL kirish narxi</span>
        <span><span style={{ color: "#ef4444", marginRight: 4 }}>──</span>Qizil chiziq — SL (stop loss, zararga to&apos;xtash)</span>
        <span><span style={{ color: "#22c55e", marginRight: 4 }}>──</span>Yashil chiziq — TP (maqsad narx)</span>
      </div>
      <ClaudeViewButton pair={inst.pair} enabled={!!provider()} />
    </section>
  );
}
