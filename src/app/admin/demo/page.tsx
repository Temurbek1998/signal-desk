import Link from "next/link";
import { Fragment } from "react";
import { adminHref } from "@/lib/adminPath.ts";
import { activeInstruments } from "@/lib/instruments.ts";
import { marketOpen } from "@/lib/sessions.ts";
import { signalLabel } from "@/lib/types.ts";
import { requireAdmin } from "@/lib/server/auth.ts";
import { demoSummary, type DemoTrade } from "@/lib/server/demo.ts";
import { liveBoard, type LiveTrade } from "@/lib/server/live.ts";
import { outcomeNote } from "@/lib/demoNote.ts";
import AutoRefresh from "../../components/AutoRefresh.tsx";

export const metadata = { title: "Demo hisob", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const OUTCOME: Record<string, string> = { tp1: "TP 1", tp2: "TP 2", sl: "SL", close: "Kun oxiri", be: "TP1, so'ng kirishda", trail: "Claude SL i", closed: "Claude yopdi", expired: "Muddatda yopildi" };
const outcome = (t: DemoTrade) => (t.strategy && t.strategy !== "trend" && t.outcome === "tp2" ? "TP" : OUTCOME[t.outcome ?? ""] ?? t.outcome);
const strat = (s: string | undefined) => signalLabel(s);
const usdt = (n: number) => `${n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(",", ".")} USDT`;
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${usdt(Math.abs(n))}`;
const px = (n: number | null) => (n == null ? "—" : Math.abs(n) >= 100 ? Number(n).toFixed(2) : Number(n).toPrecision(6));
const lot = (n: number | null) => (n == null ? "—" : Number(n) >= 1 ? Number(n).toFixed(2) : Number(n).toFixed(3));
const when = (d: Date | null) => (d ? new Date(d).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Tashkent" }) : "—");

// Balans egri chizig'i: bitta shkala, boshlang'ich balans chizig'i va oxirgi nuqta ajratilgan.
function Curve({ points, start }: { points: { t: number; balance: number }[]; start: number }) {
  const W = 760, H = 240, L = 64, R = 16, T = 14, B = 26;
  const vals = points.map((p) => p.balance).concat(start);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = Math.max((hi - lo) * 0.12, start * 0.005);
  lo -= pad; hi += pad;
  const x = (i: number) => L + (points.length > 1 ? (i / (points.length - 1)) * (W - L - R) : 0);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${H - B} L${L},${H - B} Z`;
  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];
  const last = points.at(-1)!;
  const up = last.balance >= start;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="curve" role="img" aria-label={`Balans ${usdt(start)} dan ${usdt(last.balance)} gacha`}>
      {ticks.map((v) => (
        <g key={v}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="grid" />
          <text x={L - 8} y={y(v) + 4} textAnchor="end" className="tick">{Math.round(v).toLocaleString("ru-RU")}</text>
        </g>
      ))}
      <line x1={L} x2={W - R} y1={y(start)} y2={y(start)} className="base" />
      <path d={area} className={`area ${up ? "up" : "down"}`} />
      <path d={line} className={`line ${up ? "up" : "down"}`} />
      <circle cx={x(points.length - 1)} cy={y(last.balance)} r={4.5} className={`end ${up ? "up" : "down"}`} />
      <text x={L} y={H - 6} className="tick">{new Date(points[0].t).toLocaleDateString("ru-RU")}</text>
      <text x={W - R} y={H - 6} textAnchor="end" className="tick">{points.length - 1} ta yopilgan savdo</text>
    </svg>
  );
}

// Darajalar chizig'i: SL, kirish, TP1, TP2 va joriy narx bitta o'qda (BUY da chapdan o'ngga, SELL da teskari).
// O'q faqat darajalar bo'yicha; narx ulardan tashqarida bo'lsa chetda ko'rsatiladi. Yozuvlar yuqori-past navbatma-navbat.
function Ladder({ t, live }: { t: DemoTrade; live: LiveTrade | undefined }) {
  const dir = t.side === "BUY" ? 1 : -1;
  const sl = live?.stop ?? Number(t.sl);
  const lv = [Number(t.sl), sl, Number(t.entry), Number(t.tp1 ?? t.entry), Number(t.tp2 ?? t.tp1 ?? t.entry)].map((v) => v * dir);
  const lo = Math.min(...lv), hi = Math.max(...lv);
  const W = 240, x = (v: number) => 10 + Math.min(1, Math.max(0, (v * dir - lo) / (hi - lo || 1))) * (W - 20);
  const mark = (v: number, cls: string, label: string, up: boolean) => (
    <g key={label}><line x1={x(v)} x2={x(v)} y1={16} y2={30} className={cls} /><text x={x(v)} y={up ? 11 : 42} textAnchor="middle" className="tick">{label}</text></g>
  );
  const price = live?.price ?? null;
  return (
    <svg viewBox={`0 0 ${W} 46`} className="ladder" role="img" aria-label="SL, kirish, TP va joriy narx">
      <line x1={10} x2={W - 10} y1={23} y2={23} className="rail" />
      {mark(sl, "lv sl", live?.slMoved || live?.tp1Hit ? "SL*" : "SL", false)}
      {mark(Number(t.entry), "lv entry", "Kirish", true)}
      {t.tp1 != null && mark(Number(t.tp1), "lv tp", "TP1", false)}
      {t.tp2 != null && mark(Number(t.tp2), "lv tp", "TP2", true)}
      {price != null && <circle cx={x(price)} cy={23} r={5} className={`now ${(price - Number(t.entry)) * dir >= 0 ? "up" : "down"}`} />}
    </svg>
  );
}

function Row({ t }: { t: DemoTrade }) {
  const pnl = Number(t.pnl);
  const note = outcomeNote(t);
  return (
    <>
    <tr className="has-note">
      <td>{when(t.opened_at)}</td>
      <td>{when(t.closed_at)}</td>
      <td>{t.pair} <span className="muted">{t.timeframe} · {strat(t.strategy)}</span></td>
      <td className={t.side === "BUY" ? "up" : "down"}>{t.side}</td>
      <td>{t.rating && <span className={`pill rating-${t.rating}`}>{t.rating}</span>}</td>
      <td className="num">{lot(t.lots)}</td>
      <td className="num">{px(t.entry)}</td>
      <td className="num">{px(t.tp1)}</td>
      <td className="num">{px(t.tp2)}</td>
      <td className="num">{px(t.sl)}</td>
      <td><span className={`pill ${t.outcome}`}>{outcome(t)}</span></td>
      <td className={`num ${pnl >= 0 ? "up" : "down"}`}>{signed(pnl)}</td>
      <td className="num">{usdt(Number(t.balance_after))}</td>
    </tr>
    <tr className="note-row">
      <td colSpan={13}><div className="note-box text">
        <b className={note.win ? "up" : note.win === false ? "down" : undefined}>{note.text}</b>{" "}
        <span className="muted">Sabab: </span>
        {t.review ? <span>{t.review}</span> : <span className="muted">{t.review_at ? "yozilmoqda..." : "Claude tahlili navbatda (keyingi 5-10 daqiqada)."}</span>}
      </div></td>
    </tr>
    </>
  );
}

export default async function DemoAccountPage() {
  await requireAdmin();
  const [d, board] = await Promise.all([demoSummary(), liveBoard().catch(() => null)]);
  // Ochiq demo savdoning jonli holati: Claude savdolari ai_trade_id, Zeus signal_id bo'yicha.
  const liveOf = new Map<string, LiveTrade>();
  for (const p of board?.pairs ?? []) for (const lt of p.trades) liveOf.set(lt.source === "zeus" ? `s${lt.id}` : `a${lt.id}`, lt);
  const live = (t: DemoTrade) => liveOf.get(t.ai_trade_id ? `a${t.ai_trade_id}` : `s${t.signal_id}`);
  const markets = [...new Set(activeInstruments().map((i) => i.category))];
  const open = markets.some((c) => marketOpen(c));
  const winRate = d.trades ? Math.round((d.wins / d.trades) * 100) : null;
  return (
    <main className="wrap">
      <AutoRefresh seconds={30} />
      <header className="page-head">
        <div>
          <h1>Robot demo hisobi</h1>
          <p className="sub">Faqat admin ko'radi. Robot har bir kuchli signalida (A, B va C) virtual hisobda o'zi savdoga kiradi va TP yoki SL gacha
            kuzatadi. Bozor yopiq paytda (dam olish kunlari va har kuni 21:00–22:00 UTC) yangi savdo ochilmaydi.</p>
          <p className={`notice ${open ? "ok" : "warn"}`}>{open ? "Bozor ochiq: robot savdoda." : "Bozor yopiq: robot kutmoqda, ochilishi bilan davom etadi."}</p>
        </div>
        <Link className="btn sm" href={adminHref("/robot")}>Robot jurnali</Link>
      </header>

      <p className="notice warn">
        <b>Bu demo hisob, haqiqiy pul emas.</b> Savdolar robot signallari bo'yicha avtomatik hisoblanadi: boshlang'ich balans {usdt(d.start)},
        plecho 1:{d.leverage}, har savdoda balansning {d.riskPct}% i xavf ostiga qo'yiladi
        ({d.fixedLots ? `oltin va valyutada qat'iy ${d.fixedLots} lot` : `oltin va valyutada kamida ${d.minLots} lot`}), birja komissiyasi ham hisobga olinadi. Haqiqiy savdoda sirpanish va
        boshqa xarajatlar natijani o'zgartirishi mumkin. O'tgan natija kelajakni kafolatlamaydi.
      </p>

      <div className="stats">
        <div className="stat"><b className={d.balance >= d.start ? "up" : "down"}>{usdt(d.balance)}</b><span>Balans</span></div>
        <div className="stat"><b className={d.returnPct >= 0 ? "up" : "down"}>{d.returnPct >= 0 ? "+" : ""}{d.returnPct.toFixed(2)}%</b><span>Daromadlilik{d.since ? `, ${when(d.since).split(",")[0]} dan` : ""}</span></div>
        <div className="stat"><b>{winRate == null ? "—" : `${winRate}%`}</b><span>Yutuq ulushi, {d.trades} savdo</span></div>
        <div className="stat"><b>{d.maxDd.toFixed(2)}%</b><span>Eng katta pasayish</span></div>
        <div className="stat"><b>1:{d.leverage}</b><span>Plecho</span></div>
      </div>

      <section className="panel">
        <h2>Balans egri chizig'i</h2>
        {d.trades === 0 ? (
          <p className="muted">Hali yopilgan demo savdo yo'q. Robot birinchi kuchli signalini bergach, savdo shu yerda paydo bo'ladi.</p>
        ) : (
          <div className="table-wrap"><Curve points={d.curve} start={d.start} /></div>
        )}
        <p className="muted">Jami to'langan komissiya: {usdt(d.fees)}. Uzuq chiziq: boshlang'ich balans.</p>
      </section>

      {d.strategies.length > 0 && (
        <section className="panel">
          <h2>Strategiyalar bo'yicha</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Strategiya</th><th className="num">Savdolar</th><th className="num">Yutuq ulushi</th><th className="num">Sof natija</th></tr></thead>
              <tbody>
                {d.strategies.map((r) => (
                  <tr key={r.strategy}>
                    <td>{strat(r.strategy)}</td>
                    <td className="num">{r.trades}</td>
                    <td className="num">{Math.round((r.wins / r.trades) * 100)}%</td>
                    <td className={`num ${r.net >= 0 ? "up" : "down"}`}><b>{signed(r.net)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted">Zeus: trend (yuqori aniqlik, kichik TP) va pips rejimlari (SL 200, TP 300 yoki 400 pips). Gerakl: skalping/razgon,
            M5, SL 80, TP 150 pips, 2 soatda yopiladi. Ochiq savdolar 20:45 UTC da yopiladi.</p>
        </section>
      )}

      <section className="panel">
        <h2>Kunlik natija</h2>
        {d.days.length === 0 ? (
          <p className="muted">Hali yopilgan savdo yo'q.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Kun</th><th className="num">Savdolar</th><th className="num">Foydali</th><th className="num">Zararli</th><th className="num">Foyda</th><th className="num">Zarar</th><th className="num">Komissiya</th><th className="num">Sof natija</th></tr></thead>
              <tbody>
                {d.days.map((r) => (
                  <tr key={r.day}>
                    <td>{r.day.split("-").reverse().join(".")}</td>
                    <td className="num">{r.trades}</td>
                    <td className="num up">{r.wins}</td>
                    <td className="num down">{r.losses}</td>
                    <td className="num up">{signed(r.profit)}</td>
                    <td className="num down">{r.loss ? signed(-r.loss) : usdt(0)}</td>
                    <td className="num">{usdt(r.fees)}</td>
                    <td className={`num ${r.net >= 0 ? "up" : "down"}`}><b>{signed(r.net)}</b></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="muted">Foyda va zarar komissiya ayirilgandan keyin. Kunlar Toshkent vaqti bo'yicha. Lot: oltinda 1 lot = 100 unsiya.</p>
      </section>

      <section className="panel">
        <h2>Ochiq pozitsiyalar ({d.open.length}), jonli</h2>
        <p className="muted">Har 30 soniyada yangilanadi. Chiziqda: SL, kirish, TP1, TP2 va doira joriy narx. SL* Claude yaqinlashtirgan yoki TP1 dan keyin kirishga ko'chgan SL.</p>
        {d.open.length === 0 ? (
          <p className="muted">Hozir ochiq demo savdo yo'q.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ochilgan</th><th>Juftlik</th><th>Yo'nalish</th><th>Reyting</th><th className="num">Lot</th><th className="num">Kirish</th><th className="num">TP 1</th><th className="num">TP 2</th><th className="num">SL</th><th className="num">Joriy narx</th><th className="num">Yurish</th><th className="num">Suzuvchi</th><th className="num">Risk</th><th className="num">Marja</th></tr></thead>
              <tbody>
                {d.open.map((t) => {
                  const lv = live(t);
                  return (
                  <Fragment key={t.id}>
                  <tr className="has-note">
                    <td>{when(t.opened_at)}</td>
                    <td>{t.pair} <span className="muted">{t.timeframe} · {strat(t.strategy)}</span></td>
                    <td className={t.side === "BUY" ? "up" : "down"}>{t.side}</td>
                    <td>{t.rating && <span className={`pill rating-${t.rating}`}>{t.rating}</span>}</td>
                    <td className="num">{lot(t.lots)}</td>
                    <td className="num">{px(t.entry)}</td>
                    <td className="num">{px(t.tp1)}</td>
                    <td className="num">{px(t.tp2)}</td>
                    <td className="num">{px(t.sl)}{lv && lv.stop !== Number(t.sl) ? <><br /><span className="muted">hozir {px(lv.stop)}</span></> : null}</td>
                    <td className="num">{px(lv?.price ?? null)}</td>
                    <td className={`num ${(lv?.pips ?? 0) >= 0 ? "up" : "down"}`}>{lv?.pips != null ? `${lv.pips >= 0 ? "+" : "−"}${Math.abs(lv.pips).toFixed(0)} pips` : "—"}{lv?.toSlPips != null ? <><br /><span className="muted">SL gacha {lv.toSlPips.toFixed(0)}</span></> : null}</td>
                    <td className={`num ${(lv?.usdt ?? 0) >= 0 ? "up" : "down"}`}>{lv?.usdt != null ? signed(lv.usdt) : "—"}{lv?.r != null ? <><br /><span className="muted">{lv.r >= 0 ? "+" : "−"}{Math.abs(lv.r).toFixed(2)}R</span></> : null}</td>
                    <td className="num">{usdt(Number(t.risk_usdt))}</td>
                    <td className="num">{usdt(Number(t.notional) / d.leverage)}</td>
                  </tr>
                  <tr className="note-row">
                    <td colSpan={14}><div className="note-box">
                      <Ladder t={t} live={lv} />
                      <span className="muted">{lv ? [lv.tp1Hit ? "TP1 olindi, yarmi yopildi" : null, lv.slMoved ? "SL ko'chirildi" : null].filter(Boolean).join(", ") || "Kuzatilmoqda: TP1 ham, SL ham hali urilmagan" : "Joriy narx olinmadi"}</span>
                    </div></td>
                  </tr>
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {d.recent.length > 0 && (
        <section className="panel">
          <h2>Tugagan savdolar</h2>
          <p className="muted">Har savdo ostida: foyda yoki zarar, qaysi darajada yopilgani va Claude yozgan sababi.</p>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ochilgan</th><th>Yopilgan</th><th>Juftlik</th><th>Yo'nalish</th><th>Reyting</th><th className="num">Lot</th><th className="num">Kirish</th><th className="num">TP 1</th><th className="num">TP 2</th><th className="num">SL</th><th>Natija</th><th className="num">Foyda / zarar</th><th className="num">Balans</th></tr></thead>
              <tbody>{d.recent.map((t) => <Row key={t.id} t={t} />)}</tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
