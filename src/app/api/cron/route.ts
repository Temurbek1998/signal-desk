import { NextResponse } from "next/server";
import { runCycle } from "@/lib/server/runner.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  return NextResponse.json({ ok: true, ...r });
}
