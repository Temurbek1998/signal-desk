import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getAccess } from "@/lib/server/auth.ts";
import { sql } from "@/lib/server/db.ts";
import { complete, LlmNotConfigured, operatorProvider, type ChatMessage } from "@/lib/server/llm.ts";
import { operatorPrompt } from "@/lib/server/operator.ts";

export const dynamic = "force-dynamic";

const LIMIT_GUEST = 10; // mehmon uchun 24 soatda
const LIMIT_USER = 30; // ro'yxatdan o'tgan foydalanuvchi va Standart tarif uchun 24 soatda
const LIMIT_PRO = 45; // PRO tarif uchun
const LIMIT_VIP = 60; // VIP va admin uchun
const MAX_LEN = 1500;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const raw: unknown[] = Array.isArray(body?.messages) ? body.messages.slice(-12) : [];
  const messages: ChatMessage[] = raw
    .filter((m): m is ChatMessage => !!m && typeof m === "object" && ["user", "assistant"].includes((m as ChatMessage).role) && typeof (m as ChatMessage).content === "string")
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_LEN) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "Savol bo'sh" }, { status: 400 });
  }

  const access = await getAccess();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  const clientKey = access ? `u:${access.user.id}` : `g:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}`;
  const [{ n }] = await sql<{ n: string }>(
    "SELECT count(*) AS n FROM chat_log WHERE client_key = $1 AND created_at > now() - interval '1 day'",
    [clientKey],
  );
  const limit = !access ? LIMIT_GUEST : access.tier === "vip" || access.tier === "admin" ? LIMIT_VIP : access.tier === "pro" ? LIMIT_PRO : LIMIT_USER;
  if (Number(n) >= limit) {
    return NextResponse.json(
      { error: access ? "Bugungi savollar limiti tugadi. Ertaga yana yozing." : "Mehmonlar uchun limit tugadi. Ro'yxatdan o'tsangiz ko'proq savol berishingiz mumkin." },
      { status: 429 },
    );
  }

  try {
    const p = operatorProvider();
    if (!p) throw new LlmNotConfigured("operator");
    const reply = await complete(await operatorPrompt(access), messages, { provider: p, model: process.env.OPERATOR_MODEL || undefined, maxTokens: 600 });
    await sql("INSERT INTO chat_log (user_id, client_key, question, answer) VALUES ($1, $2, $3, $4)", [
      access?.user.id ?? null, clientKey, messages[messages.length - 1].content, reply,
    ]);
    return NextResponse.json({ reply });
  } catch (e) {
    if (e instanceof LlmNotConfigured) {
      return NextResponse.json({ error: "Operator hali ulanmagan. Muammo bo'lsa \"Adminga murojaat\" tugmasini bosing." }, { status: 503 });
    }
    console.error("chat", e);
    return NextResponse.json({ error: "Operator hozir javob bera olmadi. Qayta urinib ko'ring yoki \"Adminga murojaat\" tugmasini bosing." }, { status: 502 });
  }
}
