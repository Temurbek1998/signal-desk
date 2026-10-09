"use client";
import { useEffect, useState } from "react";

// Vaqtni foydalanuvchi telefoni/kompyuterining soat mintaqasida ko'rsatadi (server UTC da ishlaydi).
export default function LocalTime({ at, withDate = true }: { at: string | number | Date; withDate?: boolean }) {
  const d = new Date(at);
  const fmt = (tz?: string) =>
    d.toLocaleString("ru-RU", { timeZone: tz, hour: "2-digit", minute: "2-digit", ...(withDate ? { day: "2-digit", month: "2-digit" } : {}) });
  const [text, setText] = useState(() => fmt("UTC") + " UTC");
  useEffect(() => setText(fmt()), [at]); // eslint-disable-line react-hooks/exhaustive-deps
  return <time dateTime={d.toISOString()} suppressHydrationWarning>{text}</time>;
}
