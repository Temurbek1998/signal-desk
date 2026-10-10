"use client";
import { useEffect, useState } from "react";

// Har soniyada yangilanadigan taymer: `to` vaqtigacha qolgan vaqt (soat:daqiqa:soniya).
export default function Countdown({ to, done = "hozir" }: { to: number; done?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now == null) return <span className="timer">--:--</span>;
  const s = Math.max(0, Math.round((to - now) / 1000));
  if (s === 0) return <span className="timer">{done}</span>;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return <span className="timer">{h ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`}</span>;
}
