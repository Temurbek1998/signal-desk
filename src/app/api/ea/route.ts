import { timingSafeEqual } from "node:crypto";
import { gated } from "@/lib/server/aiReview.ts";
import { sql } from "@/lib/server/db.ts";

export const dynamic = "force-dynamic";

// MT5 Expert Advisor uchun: savdoga tayyor oltin signallari, oddiy matn (MQL5 da JSON o'qish noqulay).
// Himoya: EA_KEY (Vercel'da egasi qo'yadi), EA uni "X-EA-Key" sarlavhasida yuboradi.
// Har qator: id;yo'nalish;kirish;sl;tp1;tp2;unix_vaqt;manba;max_soat;trail
//   z<ID>: Zeus signali (oltinda Claude tasdiqlagan), TP1 dan keyin 1 ATR (= risk/2.5) ergashuvchi SL, 8 soatda yopiladi.
//   c<ID>: Claude'ning o'z savdosi (AI treyder), TP1 dan keyin SL kirishga ko'chadi, 24 soatda yopiladi.

function keyOk(got: string) {
  const want = process.env.EA_KEY ?? "";
  if (want.length < 16) return false;
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Signal qachondan savdoga tayyor: M15 sham yopilgani (vaqt + 15 daqiqa) yoki Claude tasdiqlagan payt, qaysi keyin bo'lsa.
const ready = (t: Date, aiAt: Date | null) => Math.floor(Math.max(new Date(t).getTime() + 15 * 60_000, aiAt ? new Date(aiAt).getTime() : 0) / 1000);
const n = (x: number) => String(Math.round(Number(x) * 100) / 100);

export async function GET(req: Request) {
  if (!keyOk(req.headers.get("x-ea-key")?.trim() ?? "")) return new Response("kalit noto'g'ri yoki EA_KEY sozlanmagan\n", { status: 401 });
  const info = (req.headers.get("x-ea-info") ?? "").slice(0, 120);
  await sql(
    `INSERT INTO ea_pings (id, last_seen, info) VALUES (1, now(), $1)
     ON CONFLICT (id) DO UPDATE SET last_seen = now(), info = EXCLUDED.info`,
    [info],
  ).catch(() => {});

  const zeus = await sql<{ id: number; side: string; entry: number; sl: number; tp1: number; tp2: number; signal_time: Date; ai_verdict: string | null; ai_at: Date | null }>(
    `SELECT id, side, entry, sl, tp1, tp2, signal_time, ai_verdict, ai_at FROM signal_log
     WHERE pair = 'XAU/USD' AND coalesce(strategy, 'trend') = 'trend' AND status = 'active'
       AND signal_time > now() - interval '6 hours' ORDER BY signal_time`,
  );
  const claude = await sql<{ id: number; action: string; entry: number; sl: number; tp1: number; tp2: number; at: Date }>(
    `SELECT id, action, entry, sl, tp1, tp2, at FROM ai_trades
     WHERE pair = 'XAU/USD' AND status = 'open' AND at > now() - interval '6 hours' ORDER BY at`,
  );
  const lines = [
    // Mijozlar bilan bir xil qoida: Claude tasdiqlamagan Zeus signali savdoga berilmaydi.
    ...zeus.filter((s) => !gated("XAU/USD") || s.ai_verdict === "tasdiq").map((s) =>
      [`z${s.id}`, s.side, n(s.entry), n(s.sl), n(s.tp1), n(s.tp2), ready(s.signal_time, s.ai_at), "zeus", 8, 1].join(";")),
    ...claude.map((t) =>
      [`c${t.id}`, t.action, n(t.entry), n(t.sl), n(t.tp1), n(t.tp2), Math.floor(new Date(t.at).getTime() / 1000), "claude", 24, 0].join(";")),
  ];
  return new Response(lines.join("\n") + "\n", { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
