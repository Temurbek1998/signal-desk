import { after, NextResponse } from "next/server";
import { lastMarketTest, saveMarketTest } from "@/lib/server/marketTest.ts";
import { runCycle } from "@/lib/server/runner.ts";
import { aiDecide, aiSwingDecide, aiTraderEnabled, trackAiTrades } from "@/lib/server/aiTrader.ts";
import { reviewNewSignals } from "@/lib/server/aiReview.ts";
import { refreshStaleView } from "@/lib/server/aiView.ts";
import { reviewOpenTrades } from "@/lib/server/aiManager.ts";
import { newsCycle } from "@/lib/server/newsTrader.ts";
import { newsWatch } from "@/lib/server/newsWatch.ts";
import { spikeNotes, spikeWatch } from "@/lib/server/spikeWatch.ts";
import { cronDenied } from "@/lib/server/cronAuth.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Robotning bitta aylanishi. Har 5 daqiqada chaqirilishi kerak (Vercel Cron yoki cron-job.org):
//   GET /api/cron  bilan  Authorization: Bearer <CRON_SECRET>
// Kalit Vercel'da "Secret" turida bo'lsa qayta ko'rinmaydi: almashtirilsa cron-job.org dagi qiymat ham yangilanadi.
// O'z serveringizda (VPS) ROBOT_SELF_SCHEDULE=1 bo'lsa bu shart emas: robot o'zi ishlaydi.
export async function GET(req: Request) {
  const why = cronDenied(req);
  if (why) return NextResponse.json({ error: "Ruxsat yo'q", why }, { status: 401 });
  const r = await runCycle("cron");
  // Bozorlar sinovi haftada bir marta, javob yuborilgandan keyin (cron-job.org kutib qolmasin).
  after(async () => {
    // Yangilik reaksiyasi (M1) vaqtga sezgir: qolgan AI ishlari bilan parallel, kutmasdan.
    const news = newsCycle().catch((e) => console.error("Yangilik", e));
    // Efir impulsi: asosan /api/news-watch har daqiqada, bu yerda zaxira (har daqiqalik cron qo'yilmagan bo'lsa).
    const watch = newsWatch().catch((e) => console.error("Impuls", e));
    // Keskin harakat: zaxira (oxirgi 5 sham) va kuzatuvi tugaganlarga Claude xulosasi.
    const spike = spikeWatch(5).then(() => spikeNotes()).catch((e) => console.error("Keskin harakat", e));
    // AI treyder (demo): ochiq savdolarni kuzatish har 5 daqiqada, yangi qaror va Claude qayta ko'rishi navbat bilan.
    if (aiTraderEnabled()) {
      // Zeus'ning yangi signallariga AI ikkinchi fikri (mijozga signal bilan birga ko'rinadi).
      await reviewNewSignals().catch((e) => console.error("AI baho", e));
      await trackAiTrades().catch((e) => console.error("AI kuzatuv", e));
      // Yangi qaror va ochiq savdolarni qayta ko'rish (har savdo soatda bir) parallel: vaqt chegarasiga sig'adi.
      const [d] = await Promise.all([
        aiDecide().catch((e) => { console.error("AI qaror", e); return null; }),
        reviewOpenTrades().catch((e) => { console.error("AI qayta ko'rish", e); return []; }),
      ]);
      // Robot + Claude ko'rinishi: qaror so'ralmagan aylanishda (vaqt chegarasiga sig'ishi uchun).
      // Swing (3-5 kunlik) qaror: kun ichidagi qaror bo'lmagan aylanishda, u ham bo'lmasa ko'rinish yangilanadi.
      const s = d?.skipped ? await aiSwingDecide().catch((e) => { console.error("AI swing", e); return null; }) : null;
      if (s?.skipped) await refreshStaleView().catch((e) => console.error("AI ko'rinish", e));
    }
    await Promise.all([news, watch, spike]);
    const last = await lastMarketTest().catch(() => null);
    if (!last || Date.now() - new Date(last.at).getTime() > 7 * 86_400_000) await saveMarketTest().catch(() => {});
  });
  return NextResponse.json({ ok: true, ...r });
}
