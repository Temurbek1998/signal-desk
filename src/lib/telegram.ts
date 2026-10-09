// Admin uchun Telegram xabarlari: matn tuzish (sof funksiyalar, sinash oson).
import { signalLabel, type Signal } from "./types.ts";

export type TelegramConfig = { token: string; chatIds: string[] };

export function telegramConfig(env: Record<string, string | undefined> = process.env): TelegramConfig | null {
  const token = env.TELEGRAM_BOT_TOKEN?.trim();
  const chatIds = (env.TELEGRAM_ADMIN_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return token && chatIds.length ? { token, chatIds } : null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const RATING_NOTE: Record<string, string> = { A: "mijozlarga ham ochiq", B: "PRO va VIP ga ochiq", C: "faqat admin" };

export function signalMessage(s: Signal, rating: string | null): string {
  const arrow = s.side === "BUY" ? "🟢 BUY" : "🔴 SELL";
  const r = rating ?? "C";
  const lines = [
    `<b>${arrow} ${esc(s.pair)} · ${s.timeframe}</b> · ${signalLabel(s.strategy)}`,
    `Reyting: <b>${r}</b> (${RATING_NOTE[r] ?? ""}) · ishonch ${s.confidence}%`,
    `Kirish: <code>${s.entry}</code>`,
    s.strategy && s.strategy !== "trend" ? `TP: <code>${s.tp2}</code>` : `TP1: <code>${s.tp1}</code>  TP2: <code>${s.tp2}</code>`,
    `SL: <code>${s.sl}</code>`,
  ];
  const ctx = Object.entries(s.context ?? {});
  if (ctx.length) lines.push(`Katta trend: ${ctx.map(([k, v]) => `${k} ${v === "up" ? "↑" : v === "down" ? "↓" : "→"}`).join(", ")}`);
  if (s.newsRisk) lines.push(`⚠️ Yaqin yangilik: ${esc(s.newsRisk.title)}`);
  if (s.reasons.length) lines.push("", ...s.reasons.filter((x) => !x.startsWith("Katta trend")).slice(0, 4).map((x) => `• ${esc(x)}`));
  return lines.join("\n");
}

const RESULT: Record<string, string> = { tp1: "✅ TP1 urildi", tp2: "✅✅ TP2 urildi", sl: "❌ SL urildi" };

export function closedMessage(s: Signal): string {
  const pips = s.strategy && s.strategy !== "trend";
  const head = pips
    ? s.status === "tp2" ? "✅ TP urildi" : s.status === "close" ? `⏹ Kun oxirida yopildi (${(s.resultR ?? 0) >= 0 ? "+" : ""}${(s.resultR ?? 0).toFixed(2)}R)` : RESULT[s.status ?? ""] ?? s.status
    : s.status === "close" ? "⏹ 8 soatdan keyin yopildi" : RESULT[s.status ?? ""] ?? s.status;
  const r = s.resultR != null && !pips ? ` (${s.resultR >= 0 ? "+" : ""}${s.resultR.toFixed(2)}R)` : "";
  return `${head}${r}: <b>${s.side} ${esc(s.pair)} · ${s.timeframe} · ${signalLabel(s.strategy)}</b> (kirish ${s.entry})`;
}
