import "server-only";
import { telegramConfig } from "../telegram.ts";

// Adminga Telegram orqali xabar. Xato bo'lsa robotni to'xtatmaydi, faqat logga yozadi.
export async function notifyAdmin(html: string): Promise<void> {
  const cfg = telegramConfig();
  if (!cfg) return;
  await Promise.all(cfg.chatIds.map(async (chat_id) => {
    try {
      const res = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id, text: html, parse_mode: "HTML", disable_web_page_preview: true }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) console.error("telegram", res.status, await res.text().catch(() => ""));
    } catch (e) {
      console.error("telegram", e);
    }
  }));
}
