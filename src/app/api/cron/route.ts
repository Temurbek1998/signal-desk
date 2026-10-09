import { NextResponse } from "next/server";
import { runCycle } from "@/lib/server/runner.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Robotning bitta aylanishi. Har 5 daqiqada chaqirilishi kerak (Vercel Cron yoki cron-job.org):
//   GET /api/cron  bilan  Authorization: Bearer <CRON_SECRET>
// O'z serveringizda (VPS) ROBOT_SELF_SCHEDULE=1 bo'lsa bu shart emas: robot o'zi ishlaydi.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Ruxsat yo'q" }, { status: 401 });
  }
  const r = await runCycle("cron");
  return NextResponse.json({ ok: true, ...r });
}
