"use client";

import { useEffect, useMemo, useState } from "react";
import { signalLabel, type Category, type Signal, type Timeframe } from "@/lib/types.ts";
import NewsPanel from "../components/NewsPanel.tsx";

const TFS: Timeframe[] = ["M5", "M15", "M30", "H1"];
const CATS: Record<"all" | Category, string> = { all: "Barchasi", crypto: "Kripto", gold: "XAU/USD", forex: "Valyuta" };
const REFRESH_MS = 60_000;
// scripts/backtest.ts natijalari (kripto, 2018-yil yanvar, BACKTEST.md ga qarang).
const HISTORY: Record<Timeframe, { win: number; pf: number; trades: number; weak: boolean }> = {
  M5: { win: 54, pf: 0.5, trades: 491, weak: true },
  M15: { win: 72, pf: 1.16, trades: 144, weak: false },
  M30: { win: 73, pf: 1.2, trades: 71, weak: false },
  H1: { win: 75, pf: 0.75, trades: 12, weak: true },
};
const STATUS: Record<NonNullable<Signal["status"]>, string> = {
  active: "Faol",
  tp1: "TP 1 urildi",
  tp2: "TP 2 urildi",
  sl: "SL urildi",
  close: "Vaqt bo'yicha yopildi",
};
const isPips = (s: Signal) => !!s.strategy && s.strategy !== "trend";

type Quota = { tier: "standard" | "pro" | "vip" | "admin"; used: number; limit: number | null };
type RobotResponse = {
  timeframe: Timeframe; generatedAt: number; signals: Signal[]; errors: { pair: string; message: string }[]; quota?: Quota;
};
const TIER_NAME = { standard: "Obuna", pro: "PRO", vip: "VIP", admin: "Admin" };

function pipSize(s: Signal) {
  if (s.category === "gold") return 0.1;
  if (s.category === "forex") return s.pair.includes("JPY") ? 0.01 : 0.0001;
  return null;
}
function digits(s: Signal) {
  if (s.category === "forex") return s.pair.includes("JPY") ? 3 : 5;
  if (s.category === "gold") return 2;
  return s.entry < 1 ? 4 : 2;
}
function fmt(s: Signal, v: number | null) {
  if (v == null) return "—";
  const d = digits(s);
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
function dist(s: Signal, v: number | null) {
  if (v == null) return "";
  const p = pipSize(s);
  const d = Math.abs(v - s.entry);
  return p ? `${Math.round(d / p)} pip` : `${((d / s.entry) * 100).toFixed(2)}%`;
}
function time(t: number) {
  return new Date(t).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });
}

// Binance'dan kripto narxlarini WebSocket orqali jonli olish.
function useBinancePrices(symbols: string[]) {
  const [prices, setPrices] = useState<Record<string, { p: number; ch: number }>>({});
  const key = symbols.join(",");
  useEffect(() => {
    if (!key) return;
    const streams = key.split(",").map((s) => `${s.toLowerCase()}@miniTicker`).join("/");
    let ws: WebSocket | null = null;
    let stop = false;
    const connect = () => {
      ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data).data;
        const p = +d.c;
        const o = +d.o;
        setPrices((prev) => ({ ...prev, [d.s]: { p, ch: ((p - o) / o) * 100 } }));
      };
      ws.onclose = () => {
        if (!stop) setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      stop = true;
      ws?.close();
    };
  }, [key]);
  return prices;
}

export default function Dashboard({ categories }: { categories: Category[] }) {
  const [tf, setTf] = useState<Timeframe>("M15");
  const [cat, setCat] = useState<"all" | Category>("all");
  const [data, setData] = useState<RobotResponse | null>(null);
  const [state, setState] = useState<"busy" | "ok" | "err">("busy");
  const [strongOnly, setStrongOnly] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem("sd.strongOnly") === "0") setStrongOnly(false);
    } catch {}
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setState("busy");
      try {
        const res = await fetch(`/api/signals?tf=${tf}`, { cache: "no-store" });
        if (res.status === 401 || res.status === 402) {
          window.location.href = res.status === 401 ? "/kirish" : "/kabinet";
          return;
        }
        const json: RobotResponse = await res.json();
        if (!alive) return;
        setData(json);
        setState(json.signals.length ? "ok" : "err");
      } catch {
        if (alive) setState("err");
      }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [tf]);

  const live = useBinancePrices(["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]);

  const list = useMemo(() => {
    const s = (data?.signals ?? []).filter(
      (x) => (cat === "all" || x.category === cat) && (!strongOnly || (x.quality === "strong" && x.status === "active")),
    );
    const rank = (x: Signal) => (x.status === "active" ? 2 : x.side ? 1 : 0);
    return [...s].sort((a, b) => rank(b) - rank(a) || a.barsAgo - b.barsAgo || b.confidence - a.confidence);
  }, [data, cat, strongOnly]);
  const active = (data?.signals ?? []).filter((s) => s.status === "active" && (!strongOnly || s.quality === "strong")).length;
  const quota = data?.quota;
  const isAdmin = quota?.tier === "admin";
  const hiddenWeak = (data?.signals ?? []).filter((s) => s.status === "active" && s.quality !== "strong").length;

  return (
    <div className="wrap">
      <header className="page-head">
        <div>
          <h1>Signallar</h1>
          <p className="sub">Robot bozorni M5, M15, M30 va H1 da tahlil qilib signal beradi</p>
        </div>
        <div className="robot" role="status">
          <span className={`dot ${state === "busy" ? "busy" : state === "err" ? "err" : ""}`} />
          {state === "busy"
            ? "Robot tahlil qilmoqda…"
            : data
              ? `${tf}: ${active} ta ${strongOnly ? "kuchli " : ""}signal · yangilangan ${time(data.generatedAt)}${
                  quota ? ` · ${TIER_NAME[quota.tier]}${quota.limit ? `: bugun ${quota.used}/${quota.limit}` : ""}` : ""
                }`
              : "Ma'lumot olinmadi"}
        </div>
      </header>

      <div className="ticker" aria-label="Jonli narxlar">
        {Object.entries(live).map(([sym, v]) => (
          <div className="tick" key={sym}>
            <b>{sym.replace("USDT", "")}</b>
            <span>{v.p.toLocaleString("en-US", { maximumFractionDigits: v.p < 1 ? 4 : 2 })}</span>
            <span className={v.ch >= 0 ? "up" : "down"}>
              {v.ch >= 0 ? "+" : ""}
              {v.ch.toFixed(2)}%
            </span>
          </div>
        ))}
        {(data?.signals ?? [])
          .filter((s) => s.category !== "crypto")
          .map((s) => (
            <div className="tick" key={s.pair}>
              <b>{s.pair}</b>
              <span>{fmt(s, s.price)}</span>
            </div>
          ))}
      </div>

      <NewsPanel />

      <div className="bar">
        <div className="seg" role="group" aria-label="Taymfreym">
          {TFS.map((t) => (
            <button key={t} aria-pressed={tf === t} onClick={() => setTf(t)}>
              {t}
            </button>
          ))}
        </div>
        {categories.length > 1 && <div className="tabs" role="group" aria-label="Kategoriya">
          {(["all", ...categories] as ("all" | Category)[]).map((k) => (
            <button key={k} className="tab" aria-pressed={cat === k} onClick={() => setCat(k)}>
              {CATS[k]}
            </button>
          ))}
        </div>}
      </div>

      {isAdmin && <label className="toggle">
        <input
          id="strong-only"
          type="checkbox"
          checked={strongOnly}
          onChange={(e) => {
            setStrongOnly(e.target.checked);
            try {
              localStorage.setItem("sd.strongOnly", e.target.checked ? "1" : "0");
            } catch {}
          }}
        />
        <span>
          <b>Faqat kuchli signallar</b>
          <span className="muted">
            Barcha filtrlardan o'tgan, tarixiy sinovda eng yaxshi natija bergan sharoitdagi signallar (M15, M30). Yangilik
            oldidan signal berilmaydi. Admin sifatida o'chirsangiz kuchsiz signallar ham ko'rinadi.
          </span>
        </span>
      </label>}

      <p className={`notice ${HISTORY[tf].weak ? "warn" : ""}`}>
        {tf} tarixiy sinovda: win rate {HISTORY[tf].win}%, profit factor {HISTORY[tf].pf}, {HISTORY[tf].trades} ta savdo.{" "}
        {tf === "M5" && "Bu taymfreymda robot tarixda zararda bo'lgan, signallarga ehtiyot bo'ling."}
        {tf === "H1" && "Bu taymfreym bo'yicha ma'lumot kam, natija ishonchli emas."}
      </p>

      {data && data.errors.length > 0 && (
        <p className="notice">
          Narx olinmadi: {data.errors.map((e) => e.pair).join(", ")}. Robot keyingi yangilanishda qayta urinadi.
        </p>
      )}

      <div className="grid">
        {list.length === 0 && (
          <div className="empty">
            {state === "busy"
              ? "Robot bozorni tahlil qilmoqda…"
              : strongOnly
                ? `Hozir ${tf} da kuchli signal yo'q. Robot barcha shartlar mos kelishini kutmoqda, bu odatiy holat.${hiddenWeak ? ` Kuchsiz signallar: ${hiddenWeak} ta (yashirilgan).` : ""}`
                : "Bu bo'limda ma'lumot yo'q."}
          </div>
        )}
        {list.map((s) => (
          <SignalCard key={s.pair + s.timeframe + (s.strategy ?? "")} s={s} tier={quota?.tier} />
        ))}
      </div>

      <footer>
        Signallar texnik indikatorlar (EMA, RSI, ADX, ATR) va yuqori taymfreym trendi asosida avtomatik hisoblanadi va moliyaviy maslahat emas. Har
        qanday savdo xavf bilan bog'liq, foyda kafolatlanmaydi.
      </footer>
    </div>
  );
}

function SignalCard({ s, tier }: { s: Signal; tier?: Quota["tier"] }) {
  if (s.locked) {
    return (
      <article className="card locked">
        <div className="top">
          <div>
            <div className="pair">{s.pair}</div>
            <div className="cat">{CATS[s.category]} · {s.timeframe}</div>
          </div>
          <span className="pill active">{s.rating === "B" && tier === "standard" ? "PRO" : "LIMIT"}</span>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {s.rating === "B" && tier === "standard"
            ? "Bu B reytingli signal PRO va VIP obunachilarga ochiq."
            : tier === "vip"
              ? "Bugungi 15 ta signal limitingiz tugadi."
              : "Bugungi signal limitingiz tugadi."}
        </p>
        <a className="btn gold sm" href="/kabinet">Tarifni ko'rish</a>
      </article>
    );
  }
  const side = s.side === "BUY" ? "buy" : s.side === "SELL" ? "sell" : "none";
  return (
    <article className={`card ${s.status === "active" ? "" : "wait"}`}>
      <div className="top">
        <div>
          <div className="pair">{s.pair}</div>
          <div className="cat">
            {CATS[s.category]} · {s.timeframe}
            {" · "}{signalLabel(s.strategy)}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          {s.side && s.rating && <span className={`pill rating-${s.rating}`} title="Xotira reytingi">{s.rating}</span>}
          {s.side && s.quality === "strong" && !s.rating && <span className="pill active">KUCHLI</span>}
          <span className={`side ${side}`}>{s.side ?? "KUTISH"}</span>
        </div>
      </div>

      {s.newsRisk && (
        <p className="newsflag">
          Yangilik xavfi: {s.newsRisk.currency} {s.newsRisk.title}, {time(s.newsRisk.time)}. Narx keskin o'zgarishi mumkin.
        </p>
      )}

      {s.side ? (
        <>
          <div className="levels">
            {s.barsAgo > 0 && (
              <>
                <span className="k">HOZIR</span>
                <span>{fmt(s, s.price)}</span>
                <span className="d" />
              </>
            )}
            <span className="k">KIRISH</span>
            <span>{fmt(s, s.entry)}</span>
            <span className="d" />
            {isPips(s) ? (
              <>
                <span className="k">TP</span>
                <span className="up">{fmt(s, s.tp2)}</span>
                <span className="d">{dist(s, s.tp2)}</span>
              </>
            ) : (
              <>
                <span className="k">TP 1</span>
                <span className="up">{fmt(s, s.tp1)}</span>
                <span className="d">{dist(s, s.tp1)}</span>
                <span className="k">TP 2</span>
                <span className="up">{fmt(s, s.tp2)}</span>
                <span className="d">{dist(s, s.tp2)}</span>
              </>
            )}
            <span className="k">SL</span>
            <span className="down">{fmt(s, s.sl)}</span>
            <span className="d">{dist(s, s.sl)}</span>
          </div>
          {isPips(s) ? (
            <p className="muted" style={{ margin: 0 }}>{s.strategy?.startsWith("scalp")
              ? "Gerakl skalping: TP 150, SL 80 pips. Savdo 2 soatdan keyin o'z-o'zidan yopiladi."
              : "Pips rejimi: har ikki savdodan taxminan biri foyda, lekin foyda zarardan 1.5–2 baravar katta. Ochiq savdo 20:45 UTC da yopiladi."}</p>
          ) : (
          <div className="conf">
            <span>Ishonch darajasi: {s.confidence}%</span>
            <div className="track">
              <div className="fill" style={{ width: `${s.confidence}%` }} />
            </div>
          </div>
          )}
        </>
      ) : (
        <div className="levels">
          <span className="k">NARX</span>
          <span>{fmt(s, s.price)}</span>
          <span className="d" />
        </div>
      )}

      {s.aiHold && (
        <p className="ai-take ehtiyot" style={{ margin: 0 }}>
          {s.aiHold === "checking"
            ? "Zeus imkoniyat topdi, Claude uni tekshirmoqda. Tasdiqlansa signal shu yerda paydo bo'ladi."
            : "Claude bu imkoniyatni xavfli deb topdi va signal yuborilmadi."}
        </p>
      )}

      {s.side && s.memoryWinrate != null && (
        <p className="muted" style={{ margin: 0 }}>
          Robot xotirasi: {s.pair} {s.timeframe} da {s.memoryN ?? 0} ta yopilgan signal, kutilgan natija{" "}
          {Math.round(s.memoryWinrate * 100)}%
        </p>
      )}

      {s.side && s.status === "active" && s.tp1Hit && s.trailStop != null && (
        <p className="okmsg">TP1 urildi: yarmini yoping. Qolgan yarmi uchun SL endi {fmt(s, s.trailStop)} da (narx ortidan ergashadi).</p>
      )}

      {s.side && s.ai && (
        <div className={`ai-take ${s.ai.verdict}`}>
          <b>{s.ai.verdict === "tasdiq" ? "✓ Claude tasdiqladi" : "⚠ Claude: ehtiyot bo'ling"}</b>
          <span>{s.ai.note}</span>
        </div>
      )}

      <ul className="reasons">
        {s.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>
      <div className="meta">
        <span>
          {s.side ? `Signal: ${time(s.candleTime)}${s.barsAgo ? ` (${s.barsAgo} sham oldin)` : ""}` : `Tahlil: ${time(s.candleTime)}`}
        </span>
        {s.status && <span className={`pill ${s.status === "active" && s.tp1Hit ? "tp1" : s.status}`}>{s.status === "active" && s.tp1Hit ? "TP 1 urildi, yarmi ochiq" : STATUS[s.status]}</span>}
      </div>
    </article>
  );
}
