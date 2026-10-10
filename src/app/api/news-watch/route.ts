import { NextResponse } from "next/server";
import { cronDenied } from "@/lib/server/cronAuth.ts";
import { newsWatch } from "@/lib/server/newsWatch.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Yangilik efiri kuzatuvi: cron-job.org da HAR DAQIQADA chaqiriladi (asosiy /api/cron bilan bir xil kalit):
//   GET /api/news-watch  bilan  Authorization: Bearer <CRON_SECRET>
// Yangilik oynasidan tashqarida darhol qaytadi (narx so'ralmaydi), oynada M1 ni tekshiradi va impuls bo'lsa xabar beradi.
export async function GET(req: Request) {
  const why = cronDenied(req);
  if (why) return NextResponse.json({ error: "Ruxsat yo'q", why }, { status: 401 });
  return NextResponse.json({ ok: true, ...(await newsWatch()) });
}
