# Signal Desk: yangi Claude uchun qo'llanma

Bu fayl loyihani boshqa Claude (yoki dasturchi) qabul qilib olishi uchun. Avval shuni, keyin README.md,
GOLD_BACKTEST.md va BACKTEST.md ni o'qing. Loyiha egasi bilan o'zbek tilida (lotin) gaplashiladi.

## Nima bu

Oltin (XAU/USD) va valyutalar uchun pullik signal sayti. Next.js 15 (App Router, server actions, `after()`),
React 19, TypeScript, Postgres (Neon; lokalda PGlite), Vercel Hobby. `main` ga har push Vercel'da avtomatik deploy bo'ladi.
Asosiy manzil: signal-desk-vert.vercel.app (eski `signal-desk-xxxx-....vercel.app` havolalari yangilanmaydi).

## Arxitektura qisqacha

- **Zeus** (`src/lib/engine.ts`, `robot.ts`): qoidaga asoslangan robot. EMA20/EMA50 trend, ADX ≥ 20, katta taymfreym tasdig'i,
  RSI pullback. Oltinda faqat M15 kuchli. Oltin chiqishi: TP1 0.5R da yarmi yopiladi, so'ng 1 ATR ergashuvchi SL, TP2 1.5R,
  8 soatda (32 M15 sham) yopiladi (`EXIT_BY_CATEGORY`, `walkTrailing`). Sinov: GOLD_BACKTEST.md.
- **Cron**: cron-job.org har 5 daqiqada `/api/cron` ni chaqiradi (`Authorization: Bearer CRON_SECRET`), `maxDuration` 120.
  `runCycle` (runner.ts) robotni yurgizadi, `after()` ichida AI ishlari.
- **Claude qatlami** (`src/lib/server/`):
  - `llm.ts`: provayderlar anthropic / deepseek / gemini / mock. Anthropic raw fetch + `output_config.format` JSON sxema.
  - `aiReview.ts`: Zeus'ning har yangi kuchli signalini (oltin va valyuta) Claude baholaydi: "tasdiq" yoki "ehtiyot" va to'liq tahlil.
    **Oltinda Claude yakuniy qaror qiladi** (`gated`, `AI_GATE`): mijoz faqat "tasdiq" olgan signalni ko'radi (`/api/signals`).
    Valyutalar faqat admin sinovida.
  - `aiTrader.ts`: Claude'ning o'zi oltinda demo savdo qiladi (har 2 soatda, Opus), natija R da Zeus bilan solishtiriladi.
    Har qaror "Robot + Claude" ko'rinishi sifatida ham `ai_views` ga yoziladi.
  - `aiView.ts`: valyutalar uchun Robot + Claude tahlili, navbat bilan har 8 soatda (Sonnet).
  - `aiBudget.ts`: kunlik chaqiruvlar chegarasi (`AI_DAILY_CALLS`, standart 40, ~$50/oy). Oltin signalini baholash chegarasiz.
  - `src/lib/aiAnalysis.ts`: tahlil sxemasi (strategiya, trendlar, darajalar, zonalar, sabablar, xavflar, bekor bo'lish narxi).
- **Admin** (`src/app/admin/`, maxfiy manzil `ADMIN_PATH` orqali, oddiy `/admin` 404 beradi):
  "Signal pulti" (`pult`: barcha juftliklar, texnik tahlil, kirish/SL/TP, kirish taymeri), "Robot + Claude" (`tahlil`), "AI treyder" (`ai`, juftliklar natijasi, signallar jadvali), `ai/tahlil?s=ID|t=ID&tf=H1`
  (bitta signal yoki qarorning to'liq tahlili). Grafiklar `TvChart.tsx` (TradingView Lightweight Charts).
- **Tariflar** (`db/schema.sql`, `memory.ts` TIER_RULES): 2026-10-10 dan bitta tarif: 20 USDT/oy (`standard`, kuniga 6 tagacha A/B signal).
  PRO/VIP faqat eski obunalar uchun. To'lov USDT, admin qo'lda tasdiqlaydi.
- **MT5 avtosavdo**: `public/mt5/SignalDeskEA.mq5` (egasining MT5 ida ishlaydi, login saytga berilmaydi) har 10 soniyada
  `/api/ea` dan (sarlavha `X-EA-Key` = `EA_KEY`) oddiy matn qatorlarini oladi va savdo ochadi. Faqat demo, `InpAllowReal` bilan haqiqiy.
  Admin: "MT5 avtosavdo" sahifasi (`mt5`), `ea_pings` jadvali oxirgi ulanishni saqlaydi. MQL5 kodi bu muhitda kompilyatsiya qilinmaydi:
  MetaEditor xatolarini egasi yuboradi.
- **Operator** (`src/lib/server/operator.ts`, `/api/chat`, `ChatWidget.tsx`): har sahifadagi chat, DeepSeek yoki bepul Gemini (`DEEPSEEK_API_KEY` / `GEMINI_API_KEY`,
  `OPERATOR_PROVIDER`, `OPERATOR_MODEL`).
  Egasining talabi: Claude operatorlik qilmaydi, operator faqat platforma savollariga javob beradi (signal, narx aytmaydi).
  Muammo bo'lsa mijoz "Adminga murojaat" bosadi: `/api/ticket`, `tickets` jadvali, Telegram xabari. Admin: "Operator" sahifasi
  (`operator`): murojaatlar (yopish tugmasi) va `chat_log`. Keyinchalik murojaatlarni avtomatlashtirish rejada.
- `/api/health`: faqat sonlar va umumiy holat (pullik signal tafsilotlari chiqmaydi). `AI_KEY`, `ai_decisions`, `ai_views`, `ai_reviews`.

## Qat'iy qoidalar (egasi bilan kelishilgan)

- Kalit va parollar chatga yoki repoga yozilmaydi: faqat Vercel Environment Variables, egasi o'zi qo'yadi.
- Saytda kafolatlangan yutuq foizi va "garant" so'zi yo'q. Claude mijoz signali uchun kirish/TP/SL o'ylab topmaydi:
  darajalar Zeus'dan, Claude faqat tasdiqlaydi yoki ushlab qoladi.
- Yangi bozor yoki strategiya mijozlarga faqat natijasi isbotlangach ochiladi (valyuta: kamida 20 yopilgan, Claude tasdiqlaganlari bo'yicha ijobiy).
- Narxni oshirish faqat 3+ oy barqaror jonli natijadan keyin.
- Commit xabarlari o'zbekcha.

## Lokal ishga tushirish va sinov

```
npm install
npm test                 # node --test, tests/*.test.ts
npx tsc --noEmit && npm run build
PGLITE_DIR=/tmp/pg DEMO_DATA=1 MAIL_PROVIDER=console ADMIN_EMAIL=admin@test.uz LLM_PROVIDER=mock CRON_SECRET=tst npx next start -p 3200
```
`DEMO_DATA=1` soxta shamlar beradi (tashqi tarmoq kerak emas), `LLM_PROVIDER=mock` Claude o'rniga namunaviy javob.
Admin: /royxat da `ADMIN_EMAIL` bilan ro'yxatdan o'ting, kod server logida chiqadi. Cron: `curl -H "Authorization: Bearer tst" localhost:3200/api/cron`.
Tarixiy oltin ma'lumoti backtest skriptlari uchun: `scripts/` (PAXG CSV).

## Ochiq ishlar

- Egasi qilishi kerak: Telegram bot kaliti (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`), `CRON_SECRET` ni uzun tasodifiy qiymatga almashtirish
  (cron-job.org da ham), Neon parolini yangilash va kompyut limiti, Vercel 2FA, `ADMIN_PATH` ni almashtirish, Brevo kaliti (email kodlari).
- Bozor ochilgach: Claude qarorlari va tahlillari paydo bo'lganini `/api/health` orqali tekshirish.
- 2–4 hafta: Claude (AI treyder) va Zeus natijalarini solishtirish; "ehtiyot" signallar natijasini kuzatish.
