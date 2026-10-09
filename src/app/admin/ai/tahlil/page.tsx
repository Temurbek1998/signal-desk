import Link from "next/link";
import type { AiAnalysis } from "@/lib/aiAnalysis.ts";
import { adminHref } from "@/lib/adminPath.ts";
import { minutesOf } from "@/lib/market.ts";
import { windowChart } from "@/lib/server/analysis.ts";
import type { AiTrade } from "@/lib/server/aiTrader.ts";
import { requireAdmin } from "@/lib/server/auth.ts";
import { sql } from "@/lib/server/db.ts";
import type { Timeframe } from "@/lib/types.ts";
import LocalTime from "../../../components/LocalTime.tsx";
import RobotChart, { type ChartLevel, type ChartSignal } from "../../../components/RobotChart.tsx";

export const metadata = { title: "Claude tahlili", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type SignalRow = {
  id: number; pair: string; timeframe: string; side: "BUY" | "SELL"; entry: number; tp1: number; tp2: number; sl: number; confidence: number;
  signal_time: Date; status: string; result_r: number | null; rating: string | null; strategy: string;
  ai_verdict: string | null; ai_confidence: number | null; ai_note: string | null; ai_at: Date | null; ai_analysis: AiAnalysis | null;
  zeus: { reasons?: string[]; rsi?: number; trend?: string; context?: Record<string, string> | null; newsRisk?: { title: string; currency: string } | null } | null;
};

const TREND: Record<string, string> = { up: "↑ yuqori", down: "↓ past", flat: "→ yon" };
const STATUS: Record<string, string> = {
  active: "Ochiq", tp1: "TP1 urildi", tp2: "TP2 urildi", sl: "SL urildi", close: "Vaqt bo'yicha yopildi",
  open: "Ochiq", be: "TP1, so'ng kirishda yopildi", expired: "24 soatdan keyin yopildi", wait: "Kutish", rejected: "Rad etildi",
};
// Admin istalgan taymfreymda ko'radi: Claude darajalari narx bo'yicha, shuning uchun har birida bir xil chiziladi.
const TFS: [string, number][] = [["M5", 5], ["M15", 15], ["M30", 30], ["H1", 60], ["H4", 240]];
const tfMin = (tf: string | undefined, def: number) => TFS.find(([k]) => k === tf?.toUpperCase())?.[1] ?? def;
const tfName = (m: number) => TFS.find(([, v]) => v === m)?.[0] ?? `${m}m`;

function TfChips({ base, cur }: { base: string; cur: number }) {
  return (
    <nav className="chips" aria-label="Taymfreym">
      {TFS.map(([k, m]) => <a key={k} href={`${base}&tf=${k}`} aria-current={m === cur}>{k}</a>)}
    </nav>
  );
}

const KIND: Record<string, string> = { support: "Tayanch", resistance: "Qarshilik", demand: "Talab", supply: "Taklif", liquidity: "Likvidlik" };

// Zeus strategiyasi qoidalari: har signal shu shartlarning hammasi bajarilganda chiqadi.
const ZEUS_RULES = [
  "Trend: EMA20 va EMA50 yo'nalishi (faqat trend tomonga savdo)",
  "Trend kuchi: ADX ≥ 20 (flet bozorda signal yo'q)",
  "Katta taymfreym tasdig'i: M15 uchun H1, H1 uchun H4 trendi bir xil",
  "Kirish: trend ichidagi pullback tugashi (RSI BUY uchun 45, SELL uchun 55 dan qaytadi)",
  "Risk: SL ATR bo'yicha, TP1 da yarmi yopiladi (oltinda so'ng SL 1 ATR masofada ergashadi, 8 soatda yopiladi)",
  "Xarajat filtri: spred va komissiya riskning 5% idan oshmasin",
];

export default async function AiAnalysisPage({ searchParams }: { searchParams: Promise<{ s?: string; t?: string; tf?: string }> }) {
  await requireAdmin();
  const q = await searchParams;
  const back = <Link href={adminHref("/ai")} className="muted">← AI treyder</Link>;

  if (q.t) {
    const [t] = await sql<AiTrade>("SELECT * FROM ai_trades WHERE id = $1", [Number(q.t) || 0]);
    if (!t) return <main className="wrap">{back}<p className="err">Qaror topilmadi.</p></main>;
    const at = new Date(t.at).getTime();
    const tm = tfMin(q.tf, 60);
    const chart = await windowChart(t.pair, tm, at, 90, Math.round(30 * 60 / tm)).catch(() => null);
    const sig: ChartSignal[] = t.action !== "WAIT" && t.entry && t.sl && t.tp1 && t.tp2
      ? [{ t: at, side: t.action as "BUY" | "SELL", entry: +t.entry, sl: +t.sl, tp1: +t.tp1, tp2: +t.tp2, status: t.status, label: `Claude ${t.action}` }]
      : [];
    return (
      <main className="wrap">
        {back}
        <header className="page-head">
          <div>
            <h1>Claude qarori: {t.action} {t.pair}</h1>
            <p className="sub"><LocalTime at={t.at} /> · {STATUS[t.status] ?? t.status}{t.confidence ? ` · ishonch ${t.confidence}%` : ""}
              {t.result_r != null ? ` · natija ${Number(t.result_r) >= 0 ? "+" : ""}${Number(t.result_r).toFixed(2)}R` : ""}</p>
          </div>
        </header>
        <TfChips base={`${adminHref("/ai/tahlil")}?t=${t.id}`} cur={tm} />
        {chart && <Chart chart={chart} minutes={tm} signals={sig} a={t.analysis} title={`${tfName(tm)} grafik va Claude darajalari`} />}
        {t.reason && <section className="panel"><h2>Qaror sababi</h2><p className="ai-box" style={{ margin: 0 }}>{t.reason}</p>{t.note && <p className="err">{t.note}</p>}</section>}
        <Analysis a={t.analysis} digits={chart?.digits} />
      </main>
    );
  }

  const [s] = await sql<SignalRow>("SELECT * FROM signal_log WHERE id = $1", [Number(q.s) || 0]);
  if (!s) return <main className="wrap">{back}<p className="err">Signal topilmadi.</p></main>;
  const at = new Date(s.signal_time).getTime();
  const minutes = tfMin(q.tf, minutesOf(s.timeframe as Timeframe));
  const chart = await windowChart(s.pair, minutes, at).catch(() => null);
  const sig: ChartSignal[] = [{ t: at, side: s.side, entry: +s.entry, sl: +s.sl, tp1: +s.tp1, tp2: +s.tp2, status: s.status, label: `Zeus ${s.side}` }];
  const z = s.zeus;
  const fx = (v: number) => v.toFixed(chart?.digits ?? 2);
  return (
    <main className="wrap">
      {back}
      <header className="page-head">
        <div>
          <h1>{s.side} {s.pair} {s.timeframe}</h1>
          <p className="sub">
            <LocalTime at={s.signal_time} /> · {STATUS[s.status] ?? s.status}
            {s.result_r != null ? ` · natija ${Number(s.result_r) >= 0 ? "+" : ""}${Number(s.result_r).toFixed(2)}R` : ""}
            {s.rating ? ` · reyting ${s.rating}` : ""} · Zeus ishonchi {s.confidence}%
          </p>
        </div>
        {s.ai_verdict
          ? <span className={`an-verdict ${s.ai_verdict}`}>{s.pair !== "XAU/USD" ? `Claude: ${s.ai_verdict === "tasdiq" ? "tasdiq" : "ehtiyot"} (admin sinovi)` : s.ai_verdict === "tasdiq" ? "Claude tasdiqladi, mijozlarga ochildi" : "Claude ushlab qoldi"} · {s.ai_confidence}%</span>
          : <span className="an-verdict">{s.ai_at ? "Claude tekshirmoqda" : "Claude bahosi yo'q"}</span>}
      </header>

      <TfChips base={`${adminHref("/ai/tahlil")}?s=${s.id}`} cur={minutes} />
      {chart && <Chart chart={chart} minutes={minutes} signals={sig} a={s.ai_analysis} title={`${tfName(minutes)} grafik: Zeus signali (${s.timeframe}) va Claude darajalari`} />}

      <div className="an-grid">
        <section className="panel">
          <h2>Zeus nima uchun signal berdi</h2>
          <p className="muted" style={{ marginTop: 0 }}>Strategiya: trend davomi (EMA + ADX + pullback). Quyidagi qoidalarning hammasi bajarildi.</p>
          <ul className="an-check">{ZEUS_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
          {z?.reasons?.length ? (
            <>
              <h3>Signal paytidagi ko&apos;rsatkichlar</h3>
              <ul className="an-list">{z.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </>
          ) : <p className="muted">Bu signal uchun Zeus sabablari yozilmagan (yangilanishdan oldingi signal).</p>}
          {z?.context && Object.keys(z.context).length > 0 && (
            <p className="muted">Katta manzara: {Object.entries(z.context).map(([k, v]) => `${k} ${TREND[v] ?? v}`).join(" · ")}</p>
          )}
          {z?.newsRisk && <p className="err">Yangilik xavfi: {z.newsRisk.currency} {z.newsRisk.title}</p>}
        </section>
        <section className="panel">
          <h2>Savdo rejasi</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr><th>Kirish</th><td>{fx(+s.entry)}</td></tr>
                <tr><th>SL</th><td className="down">{fx(+s.sl)} ({fx(Math.abs(s.entry - s.sl))})</td></tr>
                <tr><th>TP1</th><td className="up">{fx(+s.tp1)} (yarmi yopiladi)</td></tr>
                <tr><th>TP2</th><td className="up">{fx(+s.tp2)}</td></tr>
              </tbody>
            </table>
          </div>
          {s.ai_note && <><h3>Claude izohi (mijoz ko&apos;radi)</h3><p className="ai-box" style={{ margin: 0 }}>{s.ai_note}</p></>}
        </section>
      </div>
      <Analysis a={s.ai_analysis} digits={chart?.digits} />
    </main>
  );
}

function Chart({ chart, minutes, signals, a, title }: {
  chart: Awaited<ReturnType<typeof windowChart>>; minutes: number; signals: ChartSignal[]; a: AiAnalysis | null; title: string;
}) {
  const levels: ChartLevel[] = [...(a?.levels ?? [])];
  if (a?.invalidation) levels.push({ price: a.invalidation, kind: "invalidation", note: "G'oya shu narxda bekor bo'ladi" });
  return (
    <section className="panel">
      <h2>{title}</h2>
      {!chart.covered && <p className="muted">Signal vaqti grafik ma&apos;lumotidan eski: faqat mavjud qismi ko&apos;rsatilgan.</p>}
      <RobotChart candles={chart.candles} ema20={chart.ema20} ema50={chart.ema50} signals={signals} digits={chart.digits}
        tfMinutes={minutes} levels={levels} zones={a?.zones ?? []} drawAll />
    </section>
  );
}

function Analysis({ a, digits = 2 }: { a: AiAnalysis | null; digits?: number }) {
  const fx = (v: number) => v.toFixed(digits);
  if (!a) return <section className="panel"><h2>Claude tahlili</h2><p className="muted" style={{ margin: 0 }}>To&apos;liq tahlil hali yo&apos;q. Yangi signal va qarorlarda Claude tahlili shu yerda chiziladi.</p></section>;
  return (
    <>
      <section className="panel">
        <h2>Claude tahlili</h2>
        <p style={{ marginTop: 0 }}><b>Strategiya:</b> {a.strategy}</p>
        <div className="an-trends">
          {(["D1", "H4", "H1", "M15"] as const).map((k) => (
            <div key={k}><b>{k}</b><span className={a.trends[k] === "up" ? "up" : a.trends[k] === "down" ? "down" : ""}>{TREND[a.trends[k]]}</span></div>
          ))}
        </div>
      </section>
      <div className="an-grid">
        <section className="panel">
          <h2>Asoslar</h2>
          <ul className="an-list">{a.reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          {a.risks.length > 0 && <><h3>Xavflar</h3><ul className="an-list">{a.risks.map((r) => <li key={r}>{r}</li>)}</ul></>}
        </section>
        <section className="panel">
          <h2>Darajalar va zonalar</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {a.zones.map((z, i) => <tr key={"z" + i}><th>{KIND[z.kind]} zonasi</th><td className="mono">{fx(z.from)}–{fx(z.to)}</td><td className="muted">{z.note}</td></tr>)}
                {[...a.levels].sort((x, y) => y.price - x.price).map((l, i) => <tr key={"l" + i}><th>{KIND[l.kind] ?? l.kind}</th><td className="mono">{fx(l.price)}</td><td className="muted">{l.note}</td></tr>)}
                {a.invalidation != null && <tr><th>Bekor bo&apos;lish</th><td className="mono">{fx(a.invalidation)}</td><td className="muted">G&apos;oya shu narxda bekor</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {a.scenario && <section className="panel"><h2>Ssenariy</h2><p style={{ margin: 0 }}>{a.scenario}</p></section>}
    </>
  );
}
