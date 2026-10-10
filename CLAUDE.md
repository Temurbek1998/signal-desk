# Signal Desk: yangi Claude uchun qo'llanma

Bu fayl loyihani boshqa Claude (yoki dasturchi) qabul qilib olishi uchun. Avval shuni va HOLAT.md (joriy holat), keyin README.md,
GOLD_BACKTEST.md va BACKTEST.md ni o'qing. Loyiha egasi bilan o'zbek tilida (lotin) gaplashiladi.

## Nima bu

Saytdagi nomi: **Zeus Number One** (2026-10-10 dan; repo va kodda eski nomi Signal Desk qolgan).

Oltin (XAU/USD) va valyutalar uchun pullik signal sayti. Next.js 15 (App Router, server actions, `after()`),
React 19, TypeScript, Postgres (Neon; lokalda PGlite), Vercel Hobby. `main` ga har push Vercel'da avtomatik deploy bo'ladi.
Asosiy manzil: signal-desk-vert.vercel.app (eski `signal-desk-xxxx-....vercel.app` havolalari yangilanmaydi).

## Arxitektura qisqacha

- **Zeus** (`src/lib/engine.ts`, `robot.ts`): qoidaga asoslangan robot. Saytda mijozga "Zeus" deb ko'rinadi (`ROBOT_NAME`). EMA20/EMA50 trend, ADX ≥ 20, katta taymfreym tasdig'i,
  RSI pullback. Oltinda faqat M15 kuchli. Oltin chiqishi: TP1 0.5R da yarmi yopiladi, so'ng 1 ATR ergashuvchi SL, TP2 1.5R,
  8 soatda (32 M15 sham) yopiladi (`EXIT_BY_CATEGORY`, `walkTrailing`). Sinov: GOLD_BACKTEST.md.
- **Cron**: cron-job.org har 5 daqiqada `/api/cron` ni chaqiradi (`Authorization: Bearer CRON_SECRET`), `maxDuration` 120.
  `runCycle` (runner.ts) robotni yurgizadi, `after()` ichida AI ishlari.
- **Claude qatlami** (`src/lib/server/`):
  - `llm.ts`: provayderlar anthropic / deepseek / gemini / mock. Anthropic raw fetch + `output_config.format` JSON sxema.
  - `aiReview.ts`: Zeus'ning har yangi kuchli signalini (oltin va valyuta) Claude baholaydi: "tasdiq" yoki "ehtiyot" va to'liq tahlil.
    **Oltinda Claude yakuniy qaror qiladi** (`gated`, `AI_GATE`): mijoz faqat "tasdiq" olgan signalni ko'radi (`/api/signals`).
    Valyutalar faqat admin sinovida.
  - `aiTrader.ts`: har juftlikda alohida Claude treyder demo savdo qiladi: oltin har soatda (Opus), 6 valyuta har 2 soatda
    (Sonnet, `AI_FX_TRADER*`), juftlikda 2 tagacha ochiq savdo (`AI_MAX_OPEN`). Bir cron aylanishida bitta qaror (oltin oldin, keyin eng eski juftlik). Natija R da o'lchanadi,
    har qaror "Robot + Claude" ko'rinishi sifatida ham `ai_views` ga yoziladi. MT5 EA faqat oltin Claude savdolarini oladi.
    Aniq qarorlar (ishonch >= `AI_DEMO_MIN_CONF`, 50) demo hisobga ham kiradi (`demo.ts`, `demo_trades.ai_trade_id`).
    Swing rejim (`aiSwingDecide`, `ai_trades.mode = 'swing'`, `AI_SWING*`): har juftlikda kuniga bitta 3-5 kunlik qaror
    (D1/H4/H1, oltinda 700-1000 pips maqsad, SL 0.3-2 D1 ATR, TP1 >= 1R, TP2 >= 2R), H1 bo'yicha kuzatiladi, 120 soatda yopiladi.
    Kun ichidagi savdoni to'smaydi; cron'da kun ichidagi qaror bo'lmagan aylanishda so'raladi. Faqat demo.
  - `aiManager.ts`: Claude ochiq savdolarini har soatda qayta ko'radi (`AI_REVIEW_EVERY_MIN`, cron'da qaror bilan parallel,
    aylanishda 2 tagacha): HOLD, MOVE_SL (faqat yaqinlashtirish, `ai_trades.stops`, `trackPlan` ga beriladi) yoki CLOSE
    (`status = 'closed'`, `exit_price`). Har tekshiruv `ai_trade_reviews` (Claude nazorat logi). MT5 EA ko'chirilgan SL ni olmaydi.
  - `live.ts`: admin "Jonli savdolar" (`jonli`): oltin va har valyuta alohida, Claude va Zeus ochiq savdolari joriy narx bilan
    (amaldagi SL, SL gacha pips, yurgan pips, demo USDT), 30 kunlik pips/R/USDT. Narx `getLastPrice` (cron bilan bitta kesh).
  - `newsTrader.ts` (v1.11.0): kuchli (High) yangilik chiqqach `NEWS_WAIT_MIN` (3) daqiqadan keyin Claude M1 reaksiyasini
    (`getM1`, keshsiz) tahlil qiladi: BUY/SELL/WAIT, taxminiy pips maqsadi, bekor narxi, muddat. `news_reactions` jadvali,
    natija M1 bo'yicha o'lchanadi (`newsReaction.ts`). Admin "Yangiliklar M1" (`yangiliklar`) va Telegram. Savdo ochilmaydi.
    `NEWS_PAIRS` (standart XAU/USD), `NEWS_AI=0` o'chiradi. Kalendarda haqiqiy qiymat yo'q: Claude uni narx reaksiyasidan biladi.
  - `newsWatch.ts` (v1.12.0): yangilik efiri paytida M1 ni har daqiqada (`/api/news-watch`, cron-job.org) tekshiradi,
    2-3 ta katta M1 sham bir tomonga bo'lsa (`detectImpulse`) Telegram va admin "Yangilik impulslari" (`impuls`). Claude chaqirilmaydi.
  - `spikeWatch.ts` (v1.13.0): yangilikdan qat'i nazar har daqiqada oltin M1 (standart Binance PAXGUSDT) da 2-3 daqiqada
    `SPIKE_PIPS` (180) pips harakat (`spike.ts` detectSpike) bo'lsa Telegram, `price_spikes`, 60 daqiqa kuzatuv (`followSpike`),
    so'ng Claude xulosasi (`spikeNotes`, cron). Admin "Keskin harakatlar" (`keskin`).
  - `demoReview.ts` (v1.14.0): yopilgan demo savdoga Claude (Sonnet) sababini yozadi (`demo_trades.review`); natija jumlasi `demoNote.ts`.
    Admin "Demo hisob" ochiq savdolarni jonli ko'rsatadi (`liveBoard` bilan), tugaganlar ostida izoh. `DEMO_REVIEW=0` o'chiradi.
  - `aiView.ts`: valyutalar uchun Robot + Claude tahlili (zaxira: treyder qarori bo'lmasa har 8 soatda, Sonnet).
  - `aiBudget.ts`: kunlik chaqiruvlar chegarasi (`AI_DAILY_CALLS`, standart 250; qayta ko'rishlar ham sanaladi). Oltin signalini baholash chegarasiz.
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
- Mijozlar ko'radigan joyda (sayt, operator, signal izohi) "Claude" yoki "Anthropic" so'zi yo'q (egasining qarori, 2026-10-10):
  robot "Zeus", tekshiruv "ikki bosqichli maxsus tekshiruv" / "Zeus Number One tahlil tizimi". Odamlar tekshiradi deb yozilmaydi.
  Admin panelda Claude nomi qoladi.
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
- Egasi qilishi kerak (2026-10-10): Vercel'ga `DEEPSEEK_API_KEY` yoki `GEMINI_API_KEY` (operator), Claude Console limitini v1.10.0 xarajatiga
  moslab oshirish (eski tavsiya $70 edi), `EA_KEY` va MT5 EA.
- Keyin: MT5 EA Claude ko'chirgan SL va qo'lda yopishni ham bajarishi (hozir faqat demo jadvalda).
- Bozor ochilgach: Claude qarorlari (kun ichi va swing) va tahlillari paydo bo'lganini `/api/health` orqali tekshirish.
- 2–4 hafta: Claude (AI treyder) va Zeus natijalarini solishtirish; "ehtiyot" signallar natijasini kuzatish.
