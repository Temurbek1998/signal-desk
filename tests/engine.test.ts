import { test } from "node:test";
import assert from "node:assert/strict";
import { ema, rsi, atr } from "../src/lib/indicators.ts";
import { generateSignal, latestSignal, quality, type Rules } from "../src/lib/engine.ts";

const MACD: Rules = { mode: "macd", minAdx: 0, requireHigher: false };
import type { Candle } from "../src/lib/types.ts";

test("EMA tekis qatorda o'zgarmaydi", () => {
  const out = ema(new Array(30).fill(5), 10);
  assert.ok(Number.isNaN(out[8]));
  assert.equal(out[29], 5);
});

test("RSI faqat o'sishda 100 ga teng", () => {
  const v = Array.from({ length: 30 }, (_, i) => i);
  assert.equal(rsi(v, 14)[29], 100);
});

test("ATR doimiy diapazonda shu diapazonga teng", () => {
  const c = Array.from({ length: 30 }, () => ({ h: 11, l: 9, c: 10 }));
  assert.equal(atr(c, 14)[29], 2);
});

function series(fn: (i: number) => number, n = 120): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = fn(i);
    return { t: i * 60000, o: c, h: c + 0.5, l: c - 0.5, c };
  });
}

test("yuqori trenddagi pullback dan keyin BUY beradi", () => {
  // Barqaror o'sish, keyin qisqa pasayish, so'ng yana o'sish: MACD yuqoriga kesadi.
  const c = series((i) => {
    if (i < 100) return 100 + i * 0.5;
    if (i < 125) return 150 - (i - 100) * 0.3;
    return 142.5 + (i - 125) * 0.5;
  }, 160);
  let found = null;
  for (let n = 110; n <= c.length; n++) {
    const s = generateSignal("TEST", "crypto", "M15", c.slice(0, n), null, MACD);
    if (s?.side) { found = s; break; }
  }
  assert.ok(found, "signal topilmadi");
  assert.equal(found.side, "BUY");
  assert.ok(found.sl! < found.entry && found.tp1! > found.entry && found.tp2! > found.tp1!);
});

test("pastki trenddagi qaytishdan keyin SELL beradi", () => {
  const c = series((i) => {
    if (i < 100) return 300 - i * 0.5;
    if (i < 125) return 250 + (i - 100) * 0.3;
    return 257.5 - (i - 125) * 0.5;
  }, 160);
  let found = null;
  for (let n = 110; n <= c.length; n++) {
    const s = generateSignal("TEST", "forex", "H1", c.slice(0, n), null, MACD);
    if (s?.side) { found = s; break; }
  }
  assert.ok(found, "signal topilmadi");
  assert.equal(found.side, "SELL");
  assert.ok(found.sl! > found.entry && found.tp1! < found.entry);
});

test("tekis bozorda signal bermaydi", () => {
  const c = series((i) => 100 + Math.sin(i / 3) * 0.2);
  assert.equal(generateSignal("TEST", "gold", "M5", c)?.side, null);
});

test("sham yetarli bo'lmasa null qaytaradi", () => {
  assert.equal(generateSignal("TEST", "gold", "M5", series((i) => i, 20)), null);
});

test("eski signal TP2 ga yetganini aniqlaydi", () => {
  const c = series((i) => {
    if (i < 100) return 100 + i * 0.5;
    if (i < 125) return 150 - (i - 100) * 0.3;
    return 142.5 + (i - 125) * 0.5;
  }, 180);
  const s = latestSignal("TEST", "crypto", "M15", c, null, 60, MACD);
  assert.ok(s?.side === "BUY");
  assert.ok(s.barsAgo > 0);
  assert.equal(s.status, "tp2");
});

test("pullback qoidasi yuqori taymfreym tasdiqisiz signal bermaydi", () => {
  const c = series((i) => {
    if (i < 100) return 100 + i * 0.5;
    if (i < 108) return 150 - (i - 100) * 0.6;
    return 145.2 + (i - 108) * 0.5;
  }, 115);
  for (let n = 100; n <= c.length; n++) {
    assert.equal(generateSignal("TEST", "crypto", "M15", c.slice(0, n), null)?.side, null);
  }
});

import { parseCalendar, riskFor } from "../src/lib/news.ts";

test("kalendar: NFP oltin va USD juftliklarini xavfli deb belgilaydi", () => {
  const t = Date.parse("2026-10-09T12:30:00Z");
  const ev = parseCalendar([
    { title: "Non-Farm Employment Change", country: "USD", date: "2026-10-09T08:30:00-04:00", impact: "High", forecast: "140K", previous: "142K" },
    { title: "German Factory Orders m/m", country: "EUR", date: "2026-10-09T02:00:00-04:00", impact: "Medium" },
    { title: "Some NZD event", country: "NZD", date: "2026-10-09T02:00:00-04:00", impact: "High" },
  ]);
  assert.equal(ev.length, 2);
  assert.equal(ev[1].time, t);
  assert.equal(riskFor("XAU/USD", ev, t - 30 * 60_000)?.title, "Non-Farm Employment Change");
  assert.equal(riskFor("EUR/USD", ev, t + 10 * 60_000)?.currency, "USD");
  assert.equal(riskFor("BTC/USDT", ev, t), null);
  assert.equal(riskFor("XAU/USD", ev, t - 3 * 3600_000), null);
});

test("kuchli signal: faqat M15/M30, M30 da ishonch >= 75, yangiliksiz", () => {
  assert.equal(quality({ side: "BUY", timeframe: "M15", confidence: 40 }, false), "strong");
  assert.equal(quality({ side: "BUY", timeframe: "M30", confidence: 74 }, false), "weak");
  assert.equal(quality({ side: "SELL", timeframe: "M30", confidence: 80 }, false), "strong");
  assert.equal(quality({ side: "SELL", timeframe: "M30", confidence: 80 }, true), "weak");
  assert.equal(quality({ side: "BUY", timeframe: "M5", confidence: 95 }, false), "weak");
  assert.equal(quality({ side: "BUY", timeframe: "H1", confidence: 95 }, false), "weak");
  assert.equal(quality({ side: null, timeframe: "M15", confidence: 0 }, false), "weak");
  assert.equal(quality({ side: "BUY", timeframe: "M15", confidence: 60, category: "gold" }, false), "strong");
  assert.equal(quality({ side: "BUY", timeframe: "M30", confidence: 90, category: "gold" }, false), "weak");
});

import { allocate, estimate, rate } from "../src/lib/memory.ts";

test("xotira: ma'lumot yo'q bo'lsa tarixiy taxmin, ko'paygan sari haqiqiy natijaga yaqinlashadi", () => {
  assert.equal(estimate({ n: 0, wins: 0 }), 0.72);
  assert.ok(Math.abs(estimate({ n: 100, wins: 50 }) - 0.52) < 0.01);
});

test("xotira: yomon natijali juftlik bloklanadi, yaxshisi A oladi", () => {
  assert.equal(rate(80, { n: 14, wins: 5 }, { n: 0, wins: 0 }).rating, "C");
  assert.equal(rate(80, { n: 20, wins: 17 }, { n: 0, wins: 0 }).rating, "A");
  assert.equal(rate(60, { n: 20, wins: 17 }, { n: 0, wins: 0 }).rating, "B");
  // xotira bo'sh: yuqori ishonchli signal A, qolgani B
  assert.equal(rate(80, { n: 0, wins: 0 }, { n: 0, wins: 0 }).rating, "A");
  assert.equal(rate(70, { n: 0, wins: 0 }, { n: 0, wins: 0 }).rating, "B");
});

test("tarif: standart kuniga 5 tagacha A, PRO 12 tagacha A va B, VIP cheklovsiz A va B, admin hammasi", () => {
  const day = Array.from({ length: 30 }, (_, i) => ({ id: i, rating: i % 3 === 0 ? "A" : i % 3 === 1 ? "B" : "C" }));
  assert.deepEqual(allocate(day, "standard").map((s) => s.id), [0, 3, 6, 9, 12]);
  assert.equal(allocate(day, "pro").length, 12);
  assert.ok(allocate(day, "pro").every((s) => s.rating !== "C"));
  assert.equal(allocate(day, "vip").length, 20);
  assert.ok(allocate(day, "vip").every((s) => s.rating !== "C"));
  assert.equal(allocate(day, "admin").length, 30);
});

test("demo hisob: risk 1%, SL urilsa aynan 1% yo'qotiladi, komissiya alohida", async () => {
  const { demoConfig, position, pnlOf, maxDrawdown } = await import("../src/lib/paper.ts");
  const cfg = demoConfig({});
  assert.equal(cfg.startBalance, 10_000);
  assert.equal(cfg.riskPct, 1);
  const p = position(10_000, cfg, "crypto", 100, 98);
  assert.equal(p.risk, 100);
  assert.equal(p.size, 50);
  assert.ok(Math.abs(p.fee - 5000 * 0.0008) < 1e-9);
  assert.equal(pnlOf(-1, p.risk, 0), -100);
  assert.equal(pnlOf(1, p.risk, 4), 96);
  assert.equal(demoConfig({ DEMO_RISK_PCT: "50" }).riskPct, 1); // chegaradan tashqari qiymat rad etiladi
  assert.ok(Math.abs(maxDrawdown([100, 120, 90, 130]) - 25) < 1e-9);
});

test("admin manzili: maxfiy yo'l /admin ga aylanadi, oddiy /admin yashiriladi", async () => {
  const { routeAdmin, adminHref } = await import("../src/lib/adminPath.ts");
  const env = { ADMIN_PATH: "qwert-7f3k9x2m" };
  assert.equal(routeAdmin("domen.uz", "/qwert-7f3k9x2m", env), "/admin");
  assert.equal(routeAdmin("domen.uz", "/qwert-7f3k9x2m/robot", env), "/admin/robot");
  assert.equal(routeAdmin("domen.uz", "/admin", env), "hide");
  assert.equal(routeAdmin("domen.uz", "/admin/robot", env), "hide");
  assert.equal(routeAdmin("domen.uz", "/qwert-7f3k9x2mX", env), null);
  assert.equal(routeAdmin("domen.uz", "/signallar", env), null);
  assert.equal(adminHref("/robot", env), "/qwert-7f3k9x2m/robot");
  const host = { ADMIN_HOST: "qwert.domen.uz" };
  assert.equal(routeAdmin("qwert.domen.uz:443", "/", host), "/admin");
  assert.equal(routeAdmin("domen.uz", "/", host), null);
  assert.equal(routeAdmin("domen.uz", "/admin", host), "hide");
  assert.equal(adminHref("", host), "https://qwert.domen.uz/");
  assert.equal(routeAdmin("x", "/admin", {}), null); // sozlanmasa oddiy /admin ishlaydi
});

test("komissiya filtri: harakat juda kichik bo'lsa signal berilmaydi", async () => {
  const { feeR } = await import("../src/lib/engine.ts");
  assert.ok(Math.abs(feeR("crypto", 100, 0.4) - 0.2) < 1e-9); // SL 0.4% uzoqda: kirish+chiqish 0.08% = 0.2R
  assert.ok(feeR("forex", 1.08, 0.0015) < 0.1);
  // MACD testidagi ma'lumotni 1000 marta "tinchroq" qilamiz: setup bor, lekin komissiya katta.
  const base = (i: number) => (i < 100 ? 100 + i * 0.5 : i < 125 ? 150 - (i - 100) * 0.3 : 142.5 + (i - 125) * 0.5);
  const calm = series((i) => 10000 + base(i) / 1000, 160);
  let rejected: string | null = null;
  for (let n = 110; n <= calm.length; n++) {
    const s = generateSignal("TEST", "crypto", "M15", calm.slice(0, n), null, { ...MACD, maxFeeR: 0.15 });
    assert.equal(s?.side ?? null, null);
    if (s?.rejected?.includes("komissiya")) rejected = s.rejected;
  }
  assert.ok(rejected, "komissiya sababi yozilmadi");
});

test("bozorlar: standart holatda robot hammasida, mijozga faqat oltin", async () => {
  const { activeCategories, activeInstruments, publicCategories } = await import("../src/lib/instruments.ts");
  assert.deepEqual(activeInstruments({ ROBOT_MARKETS: "gold" }).map((i) => i.pair), ["XAU/USD"]);
  assert.deepEqual(publicCategories({}), ["gold"]);
  assert.deepEqual(activeCategories({ ROBOT_MARKETS: "gold, forex" }), ["gold", "forex"]);
  assert.equal(activeInstruments({}).length, 7);
  assert.equal(activeInstruments({ ROBOT_MARKETS: "gold,forex,crypto" }).length, 12);
  assert.deepEqual(activeCategories({ ROBOT_MARKETS: "xyz" }), ["gold"]);
  const { bucketByTime } = await import("../src/lib/market.ts");
  const m5 = Array.from({ length: 24 }, (_, i) => ({ t: Date.UTC(2026, 0, 1, 0, 0) + i * 300_000, o: i, h: i + 1, l: i - 1, c: i + 0.5 }));
  const h1 = bucketByTime(m5, 60);
  assert.equal(h1.length, 2);
  assert.deepEqual(h1[0], { t: m5[0].t, o: 0, h: 12, l: -1, c: 11.5 });
});

import { closedMessage, signalMessage, telegramConfig } from "../src/lib/telegram.ts";

test("telegram: sozlama va xabar matni", () => {
  assert.equal(telegramConfig({}), null);
  assert.equal(telegramConfig({ TELEGRAM_BOT_TOKEN: "x" }), null);
  assert.deepEqual(telegramConfig({ TELEGRAM_BOT_TOKEN: "x", TELEGRAM_ADMIN_CHAT_ID: "1, 2" }), { token: "x", chatIds: ["1", "2"] });
  const s = { pair: "XAU/USD", category: "gold", timeframe: "M15", side: "BUY", entry: 4600.5, tp1: 4605, tp2: 4614, sl: 4591.5,
    confidence: 78, reasons: ["H1 trend <yuqoriga>"], rsi: 50, trend: "up", candleTime: 0, price: 4600.5, status: "active", barsAgo: 1 } as any;
  const m = signalMessage(s, "C");
  assert.match(m, /BUY XAU\/USD · M15/);
  assert.match(m, /Reyting: <b>C<\/b> \(faqat admin\)/);
  assert.match(m, /&lt;yuqoriga&gt;/);
  assert.match(closedMessage({ ...s, status: "tp2" }), /TP2 urildi/);
});

import { nextRunDelay } from "../src/lib/schedule.ts";

test("scheduler: sham yopilishidan 5 soniya keyin ishga tushadi", () => {
  const t0 = Date.UTC(2026, 9, 9, 10, 0, 0);
  assert.equal(nextRunDelay(t0 + 5000, 5), 5 * 60_000); // aynan ishlagan zahoti: keyingisi 5 daqiqadan so'ng
  assert.equal(nextRunDelay(t0 + 61_000, 5), 5 * 60_000 + 5000 - 61_000); // 10:01:01 -> 10:05:05
  assert.equal(nextRunDelay(t0, 5), 5000);
});

import { marketOpen } from "../src/lib/sessions.ts";
import { dailyStats, lotsOf } from "../src/lib/paper.ts";

test("bozor vaqti: oltin dam olish kunlari va 21:00 UTC da yopiq, kripto doim ochiq", () => {
  assert.equal(marketOpen("gold", Date.UTC(2026, 9, 7, 10)), true); // chorshanba
  assert.equal(marketOpen("gold", Date.UTC(2026, 9, 7, 21, 30)), false); // kunlik tanaffus
  assert.equal(marketOpen("gold", Date.UTC(2026, 9, 10, 12)), false); // shanba
  assert.equal(marketOpen("gold", Date.UTC(2026, 9, 11, 21)), false); // yakshanba ochilishidan oldin
  assert.equal(marketOpen("gold", Date.UTC(2026, 9, 11, 22)), true);
  assert.equal(marketOpen("crypto", Date.UTC(2026, 9, 10, 12)), true);
});

test("demo: lot va kunlik foyda/zarar", () => {
  assert.equal(lotsOf("gold", 25), 0.25);
  assert.equal(lotsOf("forex", 50_000), 0.5);
  const days = dailyStats([
    { closed_at: "2026-10-08T10:00:00Z", pnl: 120, fee: 2, outcome: "tp2" },
    { closed_at: "2026-10-08T12:00:00Z", pnl: -100, fee: 2, outcome: "sl" },
    { closed_at: "2026-10-08T20:00:00Z", pnl: 40, fee: 1, outcome: "tp1" }, // Toshkentda 9-oktabr 01:00
  ]);
  assert.deepEqual(days.map((d) => d.day), ["2026-10-09", "2026-10-08"]);
  assert.deepEqual(days[1], { day: "2026-10-08", trades: 2, wins: 1, losses: 1, profit: 120, loss: 100, fees: 4, net: 20 });
});

test("katta trend: matn va Telegram xabari", async () => {
  const { contextText } = await import("../src/lib/robot.ts");
  assert.equal(contextText({ H4: "up", D1: "down", MN: "flat" }), "H4 ↑, D1 ↓, MN →");
  const s = { pair: "XAU/USD", category: "gold", timeframe: "M15", side: "SELL", entry: 1, tp1: 1, tp2: 1, sl: 1, confidence: 70,
    reasons: ["Katta trend: H4 ↑", "RSI 40"], rsi: 40, trend: "down", candleTime: 0, price: 1, status: "active", barsAgo: 1, context: { D1: "down", W1: "up" } } as any;
  const m = signalMessage(s, "A");
  assert.match(m, /Katta trend: D1 ↓, W1 ↑/);
  assert.doesNotMatch(m, /• Katta trend/);
});

test("oltin pips rejimi: TP, SL va kun oxirida yopilish", async () => {
  const { trackFixed } = await import("../src/lib/pips.ts");
  const t0 = Date.UTC(2026, 9, 8, 10, 0); // 10:00 UTC
  const bar = (k: number, h: number, l: number, c: number): Candle => ({ t: t0 + k * 900_000, o: c, h, l, c });
  // BUY 4000, SL 3980 (200 pips), TP 4030 (300 pips)
  const up = [bar(0, 4000, 4000, 4000), bar(1, 4010, 3995, 4005), bar(2, 4031, 4004, 4025)];
  assert.deepEqual(trackFixed(up, 0, "BUY", 4000, 3980, 4030), { status: "tp2", resultR: 1.5, end: 2 });
  const down = [bar(0, 4000, 4000, 4000), bar(1, 4031, 3979, 3990)]; // bitta shamda ikkalasi: SL
  assert.equal(trackFixed(down, 0, "BUY", 4000, 3980, 4030).status, "sl");
  // 20:30 dagi sham 20:45 da yopiladi: savdo shu narxda yopiladi.
  const late = [bar(0, 4000, 4000, 4000), { t: Date.UTC(2026, 9, 8, 20, 30), o: 4010, h: 4012, l: 4008, c: 4010 }];
  assert.deepEqual(trackFixed(late, 0, "BUY", 4000, 3980, 4030), { status: "close", resultR: 0.5, end: 1 });
  assert.equal(trackFixed(up.slice(0, 2), 0, "BUY", 4000, 3980, 4030).status, "active");
});

test("London breakout: tungi oraliqdan chiqishda bitta signal, TP 400 pips", async () => {
  const { pipsSignals } = await import("../src/lib/pips.ts");
  const day = Date.UTC(2026, 9, 8);
  const c: Candle[] = [];
  // Oldingi kun (isinish uchun) va 00:00–07:00 tor oraliq 3995–4005.
  for (let k = -96; k < 28; k++) c.push({ t: day + k * 900_000, o: 4000, h: 4005, l: 3995, c: 4000 + (k % 2) });
  c.push({ t: day + 28 * 900_000, o: 4000, h: 4012, l: 3999, c: 4010 }); // 07:00 yuqoriga chiqdi
  c.push({ t: day + 29 * 900_000, o: 4010, h: 4015, l: 4008, c: 4012 });
  const out = pipsSignals("XAU/USD", c, day + 30 * 900_000).filter((s) => s.strategy === "pips-london");
  assert.equal(out.length, 1);
  assert.equal(out[0].side, "BUY");
  assert.equal(out[0].entry, 4010);
  assert.equal(out[0].sl, 3990);
  assert.equal(out[0].tp2, 4050);
  assert.equal(out[0].status, "active");
});

test("pips reytingi va strategiya statistikasi", async () => {
  const { ratePips } = await import("../src/lib/memory.ts");
  const { strategyStats } = await import("../src/lib/paper.ts");
  assert.equal(ratePips({ n: 0, wins: 0 }).rating, "A");
  assert.equal(ratePips({ n: 40, wins: 10 }).rating, "C");
  const rows = strategyStats([{ strategy: "pips-london", pnl: 80 }, { strategy: "pips-london", pnl: -40 }, { pnl: 10 }]);
  assert.deepEqual(rows[0], { strategy: "pips-london", trades: 2, wins: 1, net: 40 });
  assert.equal(rows[1].strategy, "trend");
});

test("Telegram: pips signali bitta TP bilan, kun oxiri xabari", () => {
  const s = { pair: "XAU/USD", category: "gold", timeframe: "M15", strategy: "pips-pullback", side: "BUY", entry: 4000, tp1: 4030, tp2: 4030, sl: 3980,
    confidence: 50, reasons: [], rsi: 50, trend: "up", candleTime: 0, price: 1, status: "close", resultR: 0.4, barsAgo: 1 } as any;
  assert.match(signalMessage(s, "A"), /Pips: pullback[\s\S]*TP: <code>4030<\/code>/);
  assert.match(closedMessage(s), /Kun oxirida yopildi \(\+0\.40R\)/);
});

test("Gerakl: razgon shami, SL 80 / TP 150 pips va 2 soatlik vaqt to'xtashi", async () => {
  const { scalpSignals } = await import("../src/lib/scalp.ts");
  const { signalLabel, robotOf } = await import("../src/lib/types.ts");
  const t0 = Date.UTC(2026, 9, 8, 6, 0);
  const c: Candle[] = [];
  for (let k = 0; k < 100; k++) c.push({ t: t0 + k * 300_000, o: 4000, h: 4000.5, l: 3999.5, c: 4000 + (k % 2) * 0.2 });
  // ATR ~1 dollar; 6 dollarlik yashil sham, yopilish cho'qqida.
  c.push({ t: t0 + 100 * 300_000, o: 4000, h: 4006.2, l: 3999.9, c: 4006 });
  for (let k = 101; k < 130; k++) c.push({ t: t0 + k * 300_000, o: 4006, h: 4007, l: 4005, c: 4006 });
  const s = scalpSignals("XAU/USD", c, t0 + 130 * 300_000);
  assert.equal(s.length, 1);
  assert.equal(s[0].side, "BUY");
  assert.equal(s[0].sl, 3998);
  assert.equal(s[0].tp2, 4021);
  assert.equal(s[0].status, "close"); // TP ham SL ham urilmadi: 24 shamdan keyin yopildi
  assert.equal(robotOf(s[0].strategy), "gerakl");
  assert.equal(signalLabel("scalp-razgon"), "Gerakl · Razgon");
  assert.equal(signalLabel("trend"), "Zeus");
  assert.equal(signalLabel("pips-london"), "Zeus · Pips: London");
});
