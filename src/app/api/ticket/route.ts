import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAccess } from "@/lib/server/auth.ts";
import { sql } from "@/lib/server/db.ts";
import { notifyAdmin } from "@/lib/server/telegram.ts";

export const dynamic = "force-dynamic";

const LIMIT = 5; // 24 soatda bitta foydalanuvchidan murojaatlar
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Qo'llab-quvvatlash murojaati: operator chatidagi "Adminga murojaat" formasi. Admin paneldagi "Operator" sahifasida ko'rinadi.
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const message = String(body?.message ?? "").trim().slice(0, 2000);
  const contact = String(body?.contact ?? "").trim().slice(0, 120);
  const chat = (Array.isArray(body?.chat) ? body.chat : [])
    .slice(-8)
    .map((m: { role?: string; content?: string }) => `${m?.role === "user" ? "Mijoz" : "Operator"}: ${String(m?.content ?? "").slice(0, 400)}`)
    .join("\n");
  if (message.length < 5) return NextResponse.json({ error: "Muammoni qisqacha yozing." }, { status: 400 });

  const access = await getAccess();
  if (!access && !contact) return NextResponse.json({ error: "Javob olish uchun Telegram yoki email yozing." }, { status: 400 });
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const clientKey = access ? `u:${access.user.id}` : `g:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
  const [{ n }] = await sql<{ n: string }>("SELECT count(*) AS n FROM tickets WHERE client_key = $1 AND created_at > now() - interval '1 day'", [clientKey]);
  if (Number(n) >= LIMIT) return NextResponse.json({ error: "Bugun ko'p murojaat yuborildi. Admin javobini kuting." }, { status: 429 });

  const [t] = await sql<{ id: number }>(
    "INSERT INTO tickets (user_id, client_key, contact, message, chat) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [access?.user.id ?? null, clientKey, contact, message, chat],
  );
  const who = access ? access.user.email : "mehmon";
  await notifyAdmin(`🆘 <b>Yangi murojaat #${t.id}</b>\n${esc(who)}${contact ? ` · ${esc(contact)}` : ""}\n\n${esc(message)}`);
  return NextResponse.json({ ok: true, id: t.id });
}
