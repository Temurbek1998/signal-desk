import { after, NextResponse } from "next/server";
import { lastMarketTest, saveMarketTest } from "@/lib/server/marketTest.ts";
import { runCycle } from "@/lib/server/runner.ts";
import { aiDecide, aiSwingDecide, aiTraderEnabled, trackAiTrades } from "@/lib/server/aiTrader.ts";
import { reviewNewSignals } from "@/lib/server/aiReview.ts";
import { refreshStaleView } from "@/lib/server/aiView.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Robotning bitta aylanishi. Har 5 daqiqada chaqirilishi kerak (Vercel Cron yoki cron-job.org):
//   GET /api/cron  bilan  Authorization: Bearer <CRON_SECRET>
// Kalit Vercel'da "Secret" turida bo'lsa qayta ko'rinmaydi: almashtirilsa cron-job.org dagi qiymat ham yangilanadi.
// O'z serveringizda (VPS) ROBOT_SELF_SCHEDULE=1 bo'lsa bu shart emas: robot o'zi ishlaydi.
export async function GET(req: Request) {
  // Nusxalashda tushib qolgan probel, qo'shtirnoq, "Bearer" dan keyingi probel yoki undagi imlo xatosi xalaqit bermasin.
  const clean = (v: string) => v.trim().replace(/^["']|["']$/g, "").trim();
  const secret = clean(process.env.CRON_SECRET ?? "");
  const raw = clean(req.headers.get("authorization") ?? "");
  const token = raw === secret ? raw : clean(raw.replace(/^b[a-z]{3,6}r\s*/i, ""));
  if (!secret || token !== secret) {
    // Sabab kalitni oshkor qilmaydi, faqat qaysi qism noto'g'riligini aytadi.
    const why = !secret ? "Serverda CRON_SECRET yo'q"
      : !raw ? "Authorization sarlavhasi kelmadi"
      : "Kalit CRON_SECRET bilan mos emas";
    return NextResponse.json({ error: "Ruxsat yo'q", why }, { status: 401 });
  }
  const r = await runCycle("cron");
  // Bozorlar sinovi haftada bir marta, javob yuborilgandan keyin (cron-job.org kutib qolmasin).
  after(async () => {
    // AI treyder (demo): ochiq savdolarni kuzatish har 5 daqiqada, yangi qaror soatda bir marta.
    if (aiTraderEnabled()) {
      // Zeus'ning yangi signallariga AI ikkinchi fikri (mijozga signal bilan birga ko'rinadi).
      await reviewNewSignals().catch((e) => console.error("AI baho", e));
      await trackAiTrades().catch((e) => console.error("AI kuzatuv", e));
      const d = await aiDecide().catch((e) => { console.error("AI qaror", e); return null; });
      // Robot + Claude ko'rinishi: qaror so'ralmagan aylanishda (vaqt chegarasiga sig'ishi uchun).
      // Swing (3-5 kunlik) qaror: kun ichidagi qaror bo'lmagan aylanishda, u ham bo'lmasa ko'rinish yangilanadi.
      const s = d?.skipped ? await aiSwingDecide().catch((e) => { console.error("AI swing", e); return null; }) : null;
      if (s?.skipped) await refreshStaleView().catch((e) => console.error("AI ko'rinish", e));
    }
    const last = await lastMarketTest().catch(() => null);
    if (!last || Date.now() - new Date(last.at).getTime() > 7 * 86_400_000) await saveMarketTest().catch(() => {});
  });
  return NextResponse.json({ ok: true, ...r });
}
