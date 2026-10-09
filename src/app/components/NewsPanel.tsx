"use client";

import { useEffect, useState } from "react";
import { describe, type NewsEvent } from "@/lib/news.ts";

const REFRESH_MS = 5 * 60_000;
const NOTIFY_BEFORE_MS = 15 * 60_000;
const SOON_MS = 60 * 60_000;

function clock(t: number) {
  return new Date(t).toLocaleString("uz-UZ", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}
function countdown(ms: number) {
  if (ms <= 0) return "chiqdi";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `${m} daqiqadan keyin`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} soat ${m % 60} daqiqadan keyin` : `${Math.floor(h / 24)} kundan keyin`;
}

function notified(key: string) {
  try {
    const seen: string[] = JSON.parse(localStorage.getItem("sd.notified") ?? "[]");
    if (seen.includes(key)) return true;
    localStorage.setItem("sd.notified", JSON.stringify([...seen.slice(-50), key]));
  } catch {}
  return false;
}

export default function NewsPanel() {
  const [events, setEvents] = useState<NewsEvent[]>([]);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    const load = async () => {
      try {
        const res = await fetch("/api/news", { cache: "no-store" });
        const json = await res.json();
        setEvents(json.events ?? []);
        setError(json.error ? "Iqtisodiy kalendar hozir yuklanmadi, keyinroq qayta uriniladi." : "");
      } catch {
        setError("Iqtisodiy kalendar hozir yuklanmadi, keyinroq qayta uriniladi.");
      }
    };
    load();
    const a = setInterval(load, REFRESH_MS);
    const b = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  // Muhim yangilikdan 15 daqiqa oldin va chiqqan paytda brauzer bildirishnomasi.
  useEffect(() => {
    if (perm !== "granted") return;
    for (const e of events) {
      if (e.impact !== "High") continue;
      const left = e.time - now;
      const pairs = e.pairs.join(", ");
      if (left > 0 && left <= NOTIFY_BEFORE_MS && !notified(`pre:${e.title}:${e.time}`)) {
        new Notification(`${e.currency} ${e.title} ${countdown(left)}`, {
          body: `${describe(e.title) ?? ""}\nTa'sir: ${pairs}. Bu juftliklarda ehtiyot bo'ling.`,
        });
      }
      if (left <= 0 && left > -10 * 60_000 && !notified(`out:${e.title}:${e.time}`)) {
        new Notification(`${e.currency} ${e.title} chiqdi`, {
          body: `Prognoz: ${e.forecast || "—"}, oldingi: ${e.previous || "—"}. Ta'sir: ${pairs}.`,
        });
      }
    }
  }, [events, now, perm]);

  const upcoming = events.filter((e) => e.time > now - 30 * 60_000 && e.time - now < 7 * 24 * 3600_000);
  const high = upcoming.filter((e) => e.impact === "High");
  const soon = high.filter((e) => e.time - now <= SOON_MS);

  return (
    <section className="news" aria-label="Iqtisodiy yangiliklar">
      <div className="news-head">
        <h2>Muhim yangiliklar</h2>
        {perm === "default" && (
          <button className="btn-small" onClick={async () => setPerm(await Notification.requestPermission())}>
            Bildirishnomani yoqish
          </button>
        )}
        {perm === "granted" && <span className="muted">Bildirishnoma yoqilgan: 15 daqiqa oldin ogohlantiriladi</span>}
        {perm === "denied" && <span className="muted">Bildirishnoma brauzerda bloklangan</span>}
      </div>

      {soon.length > 0 && (
        <p className="notice warn">
          {soon.map((e) => `${e.currency} ${e.title} (${countdown(e.time - now)})`).join(", ")}. Ta'sir qiladigan
          juftliklarda ({[...new Set(soon.flatMap((e) => e.pairs))].join(", ")}) narx keskin o'zgarishi mumkin, yangi
          savdo ochishdan oldin kuting.
        </p>
      )}
      {error && <p className="muted">{error}</p>}

      {high.length === 0 && !error && <p className="muted">Bu hafta oldinda yuqori ta'sirli yangilik yo'q.</p>}
      <div className="news-list">
        {high.slice(0, 8).map((e) => (
          <div className={`news-item ${e.time - now <= SOON_MS ? "soon" : ""}`} key={e.title + e.time}>
            <span className="cur">{e.currency}</span>
            <div className="what">
              <b>{e.title}</b>
              {describe(e.title) && <span className="muted">{describe(e.title)}</span>}
              <span className="muted">
                Prognoz {e.forecast || "—"} · oldingi {e.previous || "—"} · {e.pairs.join(", ")}
              </span>
            </div>
            <div className="when">
              <span>{clock(e.time)}</span>
              <span className="muted">{countdown(e.time - now)}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
