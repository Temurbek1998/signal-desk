import { NextResponse } from "next/server";
import { publicCategories } from "@/lib/instruments.ts";
import { allocate, TIER_RULES } from "@/lib/memory.ts";
import { runRobot } from "@/lib/robot.ts";
import { gated } from "@/lib/server/aiReview.ts";
import { claudeSource, clientCards, PAIR as GOLD, todayIds, toSignal } from "@/lib/server/clientSignals.ts";
import { canSeeSignals, getAccess } from "@/lib/server/auth.ts";
import { syncDemo } from "@/lib/server/demo.ts";
import { logSignals, recentSignals, type RecentSignal } from "@/lib/server/track.ts";
import { TIMEFRAMES, type Signal, type Timeframe } from "@/lib/types.ts";

export const dynamic = "force-dynamic";

const key = (pair: string, tf: string, t: number | Date, strategy = "trend") => `${pair}|${tf}|${new Date(t).getTime()}|${strategy}`;
const todayTashkent = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

// Signal ko'rinmasa "kutish" holatiga keltiriladi; limitdan oshgan kuchli signal esa qulflanadi.
function hide(s: Signal, locked: boolean): Signal {
  return {
    ...s, side: locked ? s.side : null, entry: s.price, tp1: null, tp2: null, sl: null, confidence: 0,
    status: locked ? s.status : null, locked, reasons: locked ? [] : s.reasons, rating: locked ? s.rating : null, ai: null,
  };
}

export async function GET(req: Request) {
  const access = await getAccess();
  if (!access) return NextResponse.json({ error: "Avval tizimga kiring" }, { status: 401 });
  if (!canSeeSignals(access) || !access.tier) return NextResponse.json({ error: "Faol obuna kerak" }, { status: 402 });

  const tf = (new URL(req.url).searchParams.get("tf") ?? "M15").toUpperCase() as Timeframe;
  if (!TIMEFRAMES.includes(tf)) {
    return NextResponse.json({ error: "tf quyidagilardan biri bo'lishi kerak: " + TIMEFRAMES.join(", ") }, { status: 400 });
  }
  const result = await runRobot(tf);
  await logSignals(result.signals).catch((e) => console.error("signal_log", e));
  await syncDemo().catch((e) => console.error("demo", e));

  // Kunlik limit: har kun uchun alohida, shu tarif ko'radigan signallar.
  const recent = await recentSignals().catch(() => [] as RecentSignal[]);
  // Claude tasdiqlamagan oltin signali mijozga bormaydi va kunlik limitni ham egallamaydi.
  const approved = recent.filter((r) => !gated(r.pair, r.strategy) || r.ai_verdict === "tasdiq");
  const byKey = new Map(recent.map((r) => [key(r.pair, r.timeframe, r.signal_time, r.strategy), r]));
  const days = [...new Set(recent.map((r) => r.day))];
  const allowed = new Set(days.flatMap((d) => allocate(approved.filter((r) => r.day === d), access.tier!).map((r) => key(r.pair, r.timeframe, r.signal_time, r.strategy))));
  const today = todayTashkent();

  // Ekranda har bir juftlik va strategiyadan faqat oxirgisi; pips signallari esa faqat hali ochiq bo'lsa.
  const pub = publicCategories();
  const shown = result.signals.filter((s, i, all) => {
    if (access.tier !== "admin" && !pub.includes(s.category)) return false; // yopiq bozorlar faqat admin uchun
    if (!s.strategy || s.strategy === "trend") return true;
    const last = all.filter((x) => x.pair === s.pair && x.strategy === s.strategy).at(-1);
    return last === s && s.status === "active";
  });
  const signals = shown.map((s): Signal => {
    if (!s.side) return s;
    const k = key(s.pair, s.timeframe, s.candleTime, s.strategy);
    const logged = byKey.get(k);
    const withMemory: Signal = logged
      ? {
        ...s, rating: logged.rating as Signal["rating"], memoryN: logged.memory_n, memoryWinrate: logged.memory_winrate,
        ai: logged.ai_verdict ? { verdict: logged.ai_verdict as "tasdiq" | "ehtiyot", confidence: logged.ai_confidence ?? 0, note: logged.ai_note ?? "" } : null,
      }
      : s;
    if (access.tier === "admin") return withMemory;
    if (!logged) return hide(withMemory, false); // kuchsiz signal: faqat admin ko'radi
    if (gated(s.pair, s.strategy) && logged.ai_verdict !== "tasdiq") {
      return { ...hide(withMemory, false), aiHold: logged.ai_verdict === "ehtiyot" ? "rejected" : "checking" };
    }
    if (allowed.has(k)) return withMemory;
    return hide(withMemory, true);
  });

  const rule = TIER_RULES[access.tier];
  if (claudeSource()) {
    // Oltin signali endi Claude treyderning o'z qaroridan (kirish, SL, TP Claude'dan). Zeus oltin kartalari faqat adminga.
    const [cards, ids] = await Promise.all([clientCards(), todayIds()]).catch(() => [[], []] as [Awaited<ReturnType<typeof clientCards>>, number[]]);
    const zeus = result.signals.find((s) => s.pair === GOLD && (!s.strategy || s.strategy === "trend"));
    const price = zeus?.price ?? Number(cards[0]?.entry ?? 0);
    const limit = Number.isFinite(rule.daily) ? rule.daily : Infinity;
    const gold = cards.map((t) => {
      const sig = toSignal(t, tf, price, zeus);
      const idx = ids.indexOf(Number(t.id));
      return access.tier === "admin" || idx < 0 || idx < limit ? sig : hide(sig, true);
    });
    if (!gold.length && zeus) gold.push({ ...hide(zeus, false), reasons: [], rejected: "Bozor tahlil qilinmoqda: aniq imkoniyat bo'lmaguncha signal berilmaydi." });
    const rest = access.tier === "admin" ? signals : signals.filter((s) => s.category !== "gold");
    return NextResponse.json({
      ...result,
      signals: [...gold, ...rest],
      quota: { tier: access.tier, used: Math.min(ids.length, limit), limit: Number.isFinite(rule.daily) ? rule.daily : null },
    });
  }
  const used = allocate(approved.filter((r) => r.day === today), access.tier).length;
  return NextResponse.json({
    ...result,
    signals,
    quota: { tier: access.tier, used, limit: Number.isFinite(rule.daily) ? rule.daily : null },
  });
}
