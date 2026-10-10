import { NextResponse } from "next/server";
import { ALL_INSTRUMENTS } from "@/lib/instruments.ts";
import { getLastPrice } from "@/lib/market.ts";
import { getAccess } from "@/lib/server/auth.ts";

export const dynamic = "force-dynamic";

// Admin grafiklari uchun jonli narx (oxirgi M5 sham). Twelve Data serverda 60 soniya keshlanadi, kunlik limit tejaladi.
export async function GET(req: Request) {
  const access = await getAccess();
  if (access?.tier !== "admin") return NextResponse.json({ error: "Faqat admin" }, { status: 403 });
  const pair = new URL(req.url).searchParams.get("pair") ?? "";
  const inst = ALL_INSTRUMENTS.find((i) => i.pair === pair);
  if (!inst) return NextResponse.json({ error: "Juftlik topilmadi" }, { status: 400 });
  const last = await getLastPrice(inst).catch(() => null);
  return NextResponse.json({ pair, source: inst.source, price: last?.price ?? null, at: Date.now() });
}
