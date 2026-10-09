import { db } from "@/lib/server/db.ts";

// Sayt va baza holatini tekshirish. Ulanish satri yoki parol hech qachon qaytarilmaydi.
export const dynamic = "force-dynamic";

export async function GET() {
  const env = {
    DATABASE_URL: Boolean(process.env.DATABASE_URL),
    ADMIN_EMAIL: Boolean(process.env.ADMIN_EMAIL),
    ADMIN_PATH: Boolean(process.env.ADMIN_PATH),
    CRON_SECRET: Boolean(process.env.CRON_SECRET),
    MAIL_PROVIDER: process.env.MAIL_PROVIDER ?? null,
  };
  try {
    const t = Date.now();
    await (await db()).query("SELECT 1");
    return Response.json({ db: "ok", ms: Date.now() - t, env });
  } catch (e) {
    const err = e as { message?: string; code?: string };
    const message = String(err.message ?? e).replace(/postgres(ql)?:\/\/\S+/gi, "[url]").replace(/npg_\w+/g, "[parol]");
    return Response.json({ db: "error", code: err.code ?? null, message, env }, { status: 500 });
  }
}
