import { NextResponse } from "next/server";
import { cronDenied } from "@/lib/server/cronAuth.ts";
import { newsWatch } from "@/lib/server/newsWatch.ts";
import { spikeWatch } from "@/lib/server/spikeWatch.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Yangilik efiri kuzatuvi: cron-job.org da HAR DAQIQADA chaqiriladi (asosiy /api/cron bilan bir xil kalit):
//   GET /api/news-watch  bilan  Authorization: Bearer <CRON_SECRET>
// Yangilik oynasida M1 impulsini tekshiradi; bozor ochiq bo'lsa doim keskin harakatni (spikeWatch, 2-3 daqiqada 180+ pips) ham.
export async function GET(req: Request) {
  const why = cronDenied(req);
  if (why) return NextResponse.json({ error: "Ruxsat yo'q", why }, { status: 401 });
  // Bitta daqiqa o'tkazib yuborilsa ham harakat yo'qolmasin: oxirgi 2 sham bo'yicha (takror xabar bazada to'siladi).
  const [news, spike] = await Promise.all([
    newsWatch().catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
    spikeWatch(2).catch((e) => ({ error: e instanceof Error ? e.message : String(e) })),
  ]);
  return NextResponse.json({ ok: true, news, spike });
}
