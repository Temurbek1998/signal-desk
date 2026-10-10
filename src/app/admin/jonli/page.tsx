import Link from "next/link";
import { adminHref } from "@/lib/adminPath.ts";
import { reviewEnabled } from "@/lib/server/aiManager.ts";
import { digitsOf } from "@/lib/server/analysis.ts";
import { liveBoard, sourceLabel, type LiveTrade } from "@/lib/server/live.ts";
import LiveRefresh from "../../components/LiveRefresh.tsx";
import LocalTime from "../../components/LocalTime.tsx";

export const metadata = { title: "Jonli savdolar", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ACTION: Record<string, string> = { HOLD: "Ushlab turish", MOVE_SL: "SL ko'chirish", CLOSE: "Yopish", ERROR: "Javob o'qilmadi" };
const sign = (x: number, d = 1) => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}`;
const cls = (x: number | null) => (x == null ? "" : x >= 0 ? "up" : "down");
const pct = (w: number, n: number) => (n ? `${Math.round((w / n) * 100)}%` : "—");

function TradeRow({ t }: { t: LiveTrade }) {
  const d = digitsOf(t.pair, t.entry);
  const f = (x: number) => x.toFixed(d);
  const href = t.source === "zeus" ? `${adminHref("/ai/tahlil")}?s=${t.id}` : `${adminHref("/ai/tahlil")}?t=${t.id}`;
  return (
    <tr>
      <td>{t.label}<br /><span className="muted"><LocalTime at={t.openedAt} /></span></td>
      <td className={t.side === "BUY" ? "up" : "down"}>{t.side}{t.lots != null ? <><br /><span className="muted">{t.lots.toFixed(2)} lot</span></> : null}</td>
      <td>{f(t.entry)}</td>
      <td>{t.price != null ? f(t.price) : "—"}</td>
      <td>
        <b>{f(t.stop)}</b>
        {t.slMoved ? <><br /><span className="muted">Claude ko&apos;chirgan (boshida {f(t.sl0)})</span></> : t.tp1Hit ? <><br /><span className="muted">TP1 dan keyin kirishda</span></> : null}
      </td>
      <td>{t.toSlPips != null ? `${t.toSlPips.toFixed(1)}` : "—"}<br /><span className="muted">risk {t.riskPips.toFixed(0)}</span></td>
      <td>{f(t.tp1)}{t.tp1Hit ? " ✓" : ""}<br />{f(t.tp2)}</td>
      <td className={cls(t.pips)}><b>{t.pips != null ? sign(t.pips) : "—"}</b></td>
      <td className={cls(t.usdt)}>{t.usdt != null ? `${sign(t.usdt, 2)}` : <span className="muted">demo yo&apos;q</span>}{t.r != null ? <><br /><span className="muted">{sign(t.r, 2)}R</span></> : null}</td>
      <td className="muted" style={{ minWidth: 220 }}>
        {t.review ? <><b>{ACTION[t.review.action] ?? t.review.action}</b> · <LocalTime at={t.review.at} /><br />{t.review.reason || t.review.note}</> : t.source === "zeus" ? "—" : "Hali qayta ko'rilmagan"}
      </td>
      <td><Link href={href}>Tahlil →</Link></td>
    </tr>
  );
}

export default async function LivePage() {
  const { pairs, reviews } = await liveBoard(30);
  const open = pairs.flatMap((p) => p.trades);
  const sum = (src: (s: LiveTrade["source"]) => boolean) => open.filter((t) => src(t.source) && t.usdt != null).reduce((a, t) => a + t.usdt!, 0);
  const claudeOpen = open.filter((t) => t.source !== "zeus");
  return (
    <main className="wrap">
      <LiveRefresh seconds={60} />
      <header className="page-head">
        <div>
          <h1>Jonli savdolar</h1>
          <p className="sub">
            Oltin va har valyuta alohida: ochiq savdolar joriy narx bilan, amaldagi SL qayerda, SL gacha necha pips, savdo necha pips yurdi
            va demo hisobda qancha USDT. Sahifa har daqiqada yangilanadi. Claude o&apos;z savdolarini {reviewEnabled() ? "har soatda qayta ko'radi" : "qayta ko'rmayapti (AI ulanmagan yoki AI_REVIEW=0)"}:
            ushlab turadi, SL ni yaqinlashtiradi yoki yopadi.
          </p>
        </div>
      </header>

      <section className="panel">
        <div className="stats">
          <div className="stat"><b>{claudeOpen.length}</b><span>Claude ochiq savdolari</span></div>
          <div className="stat"><b className={cls(sum((s) => s !== "zeus"))}>{sign(sum((s) => s !== "zeus"), 2)}</b><span>Claude suzuvchi natija, USDT</span></div>
          <div className="stat"><b>{open.length - claudeOpen.length}</b><span>Zeus ochiq signallari</span></div>
          <div className="stat"><b className={cls(sum((s) => s === "zeus"))}>{sign(sum((s) => s === "zeus"), 2)}</b><span>Zeus suzuvchi natija, USDT</span></div>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Pips: oltinda 1 pip = 0.10 $, JPY juftliklarida 0.01, boshqa valyutalarda 0.0001. USDT demo hisobdagi hajm bo&apos;yicha (komissiyasiz).
          TP1 urilgan savdoda yarmi TP1 da yopilgan deb hisoblanadi.
        </p>
      </section>

      {pairs.map((p) => {
        const d = digitsOf(p.pair, p.price ?? 1);
        const any = p.stats.some((s) => s.trades > 0);
        return (
          <section className="panel" key={p.pair}>
            <h2>{p.pair}{p.price != null ? ` · ${p.price.toFixed(d)}` : ""}</h2>
            {p.priceAt && <p className="muted" style={{ marginTop: 0 }}>Narx: <LocalTime at={new Date(p.priceAt)} /> holatiga</p>}
            {p.trades.length === 0 ? <p className="muted">Hozir ochiq savdo yo&apos;q.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Kim</th><th>Yo&apos;nalish</th><th>Kirish</th><th>Narx</th><th>SL (amaldagi)</th><th>SL gacha, pips</th><th>TP1 / TP2</th><th>Yurdi, pips</th><th>USDT</th><th>Claude oxirgi tekshiruvi</th><th /></tr></thead>
                  <tbody>{p.trades.map((t) => <TradeRow key={t.key} t={t} />)}</tbody>
                </table>
              </div>
            )}
            <h3 style={{ marginBottom: 6 }}>Yopilgan, 30 kun: Claude va Zeus</h3>
            {!any ? <p className="muted" style={{ margin: 0 }}>Hali yopilgan savdo yo&apos;q.</p> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Manba</th><th>Savdolar</th><th>Yutuq</th><th>Pips</th><th>R</th><th>USDT (demo)</th></tr></thead>
                  <tbody>
                    {p.stats.map((s) => (
                      <tr key={s.source}>
                        <td>{sourceLabel(s.source)}</td><td>{s.trades}</td><td>{pct(s.wins, s.trades)}</td>
                        <td className={s.trades ? cls(s.pips) : ""}>{s.trades ? sign(s.pips) : "—"}</td>
                        <td className={s.trades ? cls(s.r) : ""}>{s.trades ? `${sign(s.r, 2)}R` : "—"}</td>
                        <td className={cls(s.usdt)}>{s.usdt != null ? sign(s.usdt, 2) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}

      <section className="panel">
        <h2>Claude nazorat logi</h2>
        <p className="muted" style={{ marginTop: 0 }}>Har qayta ko&apos;rish: o&apos;sha paytdagi narx, pips, amaldagi SL, Claude qarori va sababi. SL ko&apos;chsa yoki savdo yopilsa Telegram&apos;ga ham xabar boradi.</p>
        {reviews.length === 0 ? <p className="muted">Hali qayta ko&apos;rish bo&apos;lmagan. Bozor ochiq va Claude savdosi bo&apos;lsa, har savdo soatda bir tekshiriladi.</p> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vaqt</th><th>Savdo</th><th>Narx</th><th>Pips</th><th>R</th><th>SL</th><th>Qaror</th><th>Sabab</th></tr></thead>
              <tbody>
                {reviews.map((r) => {
                  const d = digitsOf(r.pair, Number(r.price ?? 1));
                  return (
                    <tr key={r.id}>
                      <td><LocalTime at={r.at} /></td>
                      <td><Link href={`${adminHref("/ai/tahlil")}?t=${r.trade_id}`}>{r.pair} {r.side}{r.mode === "swing" ? " · swing" : ""}</Link></td>
                      <td>{r.price != null ? Number(r.price).toFixed(d) : "—"}</td>
                      <td className={cls(r.pips == null ? null : Number(r.pips))}>{r.pips != null ? sign(Number(r.pips)) : "—"}</td>
                      <td className={cls(r.result_r == null ? null : Number(r.result_r))}>{r.result_r != null ? `${sign(Number(r.result_r), 2)}R` : "—"}</td>
                      <td>{r.stop != null ? Number(r.stop).toFixed(d) : "—"}{r.new_sl != null ? ` → ${Number(r.new_sl).toFixed(d)}` : ""}</td>
                      <td>{ACTION[r.action] ?? r.action}{r.action !== "HOLD" && r.action !== "ERROR" ? (r.applied ? " ✓" : " (bajarilmadi)") : ""}{r.confidence ? ` · ${r.confidence}%` : ""}</td>
                      <td className="muted" style={{ minWidth: 260 }}>{r.reason}{r.note ? <><br /><span className="err">{r.note}</span></> : null}</td>
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
