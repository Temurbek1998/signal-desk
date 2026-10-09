import { NextResponse } from "next/server";
import { getCalendar } from "@/lib/news.ts";

export const dynamic = "force-dynamic";

// Yuqori va o'rta ta'sirli yangiliklar: so'nggi 1 soat va keyingi 7 kun.
export async function GET() {
  try {
    const now = Date.now();
    const events = (await getCalendar()).filter(
      (e) => (e.impact === "High" || e.impact === "Medium") && e.time >= now - 3600_000,
    );
    return NextResponse.json({ events });
  } catch (e) {
    return NextResponse.json({ events: [], error: e instanceof Error ? e.message : String(e) });
  }
}
