# O'zgarishlar tarixi

Har bir versiya GitHub'da teg bilan belgilanadi (`git tag`). Istalgan versiyaga qaytish yoki uni ko'rish mumkin:
GitHub → Releases/Tags, yoki `git checkout v1.0.0`. Yangi versiyada shu faylning boshiga bo'lim qo'shiladi.
Loyiha haqida to'liq qo'llanma: [CLAUDE.md](CLAUDE.md).

## v1.10.0 (2026-10-10): Claude ochiq savdolarni har soat qayta ko'radi, "Jonli savdolar" sahifasi

- Claude o'z ochiq savdolarini (kun ichi va swing) har soatda qayta ko'radi: ushlab turish, SL ni yaqinlashtirish
  (faqat xavf kamayadi) yoki joriy narxda yopish. Har tekshiruv "Claude nazorat logi"ga yoziladi (`ai_trade_reviews`):
  narx, pips, R, amaldagi SL, qaror va sabab. SL ko'chsa yoki yopilsa Telegram xabari. Sozlash: `AI_REVIEW`,
  `AI_REVIEW_EVERY_MIN` (60). MT5 EA hozircha Claude ko'chirgan SL ni olmaydi.
- Claude bozorga ko'proq kiradi: oltin har soatda (oldin 2), valyutalar har 2 soatda (oldin 4), bir juftlikda 2 tagacha
  ochiq savdo (`AI_MAX_OPEN`), WAIT faqat bozor haqiqatan noaniq bo'lsa. Demo hisobga ishonch 50% dan (oldin 60).
- Kunlik AI chegarasi 70 dan 250 ga (`AI_DAILY_CALLS`), qayta ko'rishlar ham sanaladi.
- Admin "Jonli savdolar" sahifasi: oltin va har valyuta alohida, Claude va Zeus ochiq savdolari joriy narx bilan
  (amaldagi SL, SL gacha pips, yurgan pips, demo USDT), 30 kunlik yopilgan natija (pips, R, USDT) manba bo'yicha.

## v1.9.1 (2026-10-10): mijozga "Claude" nomi ko'rinmaydi

- Sayt, signal kabineti, "Robot haqida" va operatordan "Claude" so'zi olib tashlandi: robot "Zeus", tekshiruv
  "ikki bosqichli maxsus tekshiruv". Operator AI provayderini aytmaydi. Admin panel o'zgarmadi.

## v1.9.0 (2026-10-10): Claude swing rejimi

- Har juftlikda Claude kuniga bir marta 3-5 kunlik swing savdo qarorini beradi (demo): D1, H4, H1 tahlili, oltinda
  700-1000 pips (70-100 $) maqsad. SL 0.3-2 D1 ATR, TP1 kamida 1R, TP2 kamida 2R. H1 shamlari bo'yicha kuzatiladi,
  120 soatda yopiladi. Kun ichidagi savdo bilan parallel ishlaydi. Admin "AI treyder"da "· swing" belgisi va
  "Swing qaror so'rash" tugmasi, demo hisobda SWING. Sozlash: `AI_SWING`, `AI_SWING_EVERY_H`, `AI_SWING_MAX_H`.
- Kunlik AI chegarasi 70 ga ko'tarildi; kun ichidagi qaror endi ikki marta sanalmaydi (ai_trades va ai_views).

## v1.8.0 (2026-10-10): Claude savdolari demo hisobda

- Har juftlik Claude treyderining aniq qarori (BUY/SELL, ishonch 60% va yuqori, `AI_DEMO_MIN_CONF`) avtomatik demo hisobga
  kiradi (1% risk), natijasi balansga yoziladi. Admin "Demo hisob"da "Zeus Claude · Claude treyder" bo'lib ko'rinadi.
  O'chirish: `AI_DEMO=0`. Keyinchalik demo MT5 orqali bo'ladi (egasining rejasi).

## v1.7.0 (2026-10-10): har juftlikka alohida Claude treyder

- Oltindan tashqari 6 valyuta juftligining har biriga alohida Claude treyder (demo): har 4 soatda, Sonnet. Oltin har 2 soatda, Opus.
  Har biri o'z juftligi va o'z savdolari tarixini ko'radi. Qarorlar faqat adminda; mijozga isbotlangach ochiladi.
- Admin "AI treyder": juftliklar bo'yicha Claude natijasi jadvali, jurnalda juftlik ustuni. "Signal pulti": Claude'ning ochiq savdosi.
- Kunlik AI chegarasi standarti 40 dan 60 ga (taxminan oyiga $50-55).

## v1.6.0 (2026-10-10): loyiha nomi "Zeus Number One"

- Saytda "Signal Desk" nomi "Zeus Number One" ga almashtirildi (sarlavha, logo yozuvi, footer, email kodi, operator).
  Domen, repo nomi, kod ichidagi nomlar va MT5 EA fayli o'zgarmadi.

## v1.5.1 (2026-10-10): robot nomi "Zeus Claude"

- Saytda robot endi "Zeus Claude" deb ataladi (bosh sahifa, Robot haqida, Signallar, Natijalar, operator). Kodda va admin
  sahifalaridagi taqqoslashlarda qoidalar qismi qisqacha "Zeus" bo'lib qoladi.

## v1.5.0 (2026-10-10): bitta tarif 20 USDT

- Uch tarif o'rniga bitta: 20 USDT/oy, kuniga 6 tagacha A va B reytingli signal. PRO va VIP yangi obuna uchun yopildi
  (eski obunalar o'z qoidasi bilan qoladi). Bosh sahifa, operator va obuna nomlari yangilandi.

## v1.4.0 (2026-10-10): Signal pulti (admin)

- Admin panelda "Signal pulti" sahifasi: oltin va barcha valyutalar bir joyda. Har juftlikda texnik tahlil (M15 trend, ADX, RSI,
  ATR, EMA20/50, katta trend, robot holati, Claude fikri), faol signal (kirish, SL, TP1, TP2 va R masofalari, Claude bahosi).
- Taymer: kirishgacha (sham yopilishi va Claude tasdig'i), kirish oynasi tugashigacha (20 daqiqa, MT5 EA bilan bir xil),
  signal bo'lmasa keyingi M15 tekshiruvigacha, bozor yopiq bo'lsa ochilishigacha.
- Tanlangan juftlikning TradingView uslubidagi grafigi: signal darajalari, Claude darajalari va zonalari.

## v1.3.1 (2026-10-10): Operator uchun bepul Gemini

- Operator DeepSeek o'rniga bepul Gemini (`GEMINI_API_KEY`) bilan ham ishlaydi. `OPERATOR_PROVIDER` bilan tanlanadi.

## v1.3.0 (2026-10-10): Operator faqat platforma savollari, adminga murojaat

- Operator faqat DeepSeek'da (Claude zaxirasi olib tashlandi) va faqat platforma haqidagi savollarga javob beradi:
  signallar ro'yxati va bozor gaplari ko'rsatmadan olib tashlandi.
- Chatda "Adminga murojaat" tugmasi: murojaat (tiket) `tickets` jadvaliga yoziladi, Telegram bo'lsa adminga xabar.
  Admin "Operator" sahifasida murojaatlar ro'yxati va "yopish" tugmasi.

## v1.2.1 (2026-10-10): Operator DeepSeek'da

- Operator chati alohida provayderda: `DEEPSEEK_API_KEY` bo'lsa DeepSeek, xato bo'lsa bir marta Claude javob beradi.
  Claude tahlillari, signal tasdig'i va AI treyder Anthropic'da qoladi. Sozlamalar: `OPERATOR_PROVIDER`, `OPERATOR_MODEL`.

## v1.2.0 (2026-10-10): Operator yangilandi

- Operator chati obunachiga endi faqat Claude tasdiqlagan oltin signallarini aytadi (avval tasdiqlanmaganini ham aytishi mumkin edi).
- Operator ko'rsatmasi yangilandi: Claude'ning yakuniy qarori, oltin chiqish qoidalari (SL 2.5 ATR, ergashuvchi SL, 8 soat),
  tarixiy natija kafolat emasligi, jonli natija hali yig'ilayotgani.
- Admin panelda "Operator" sahifasi: ulanish holati, savollar soni va oxirgi 60 ta yozishma.

## v1.1.0 (2026-10-10): MT5 avtosavdo (demo)

- MT5 Expert Advisor (`public/mt5/SignalDeskEA.mq5`): Claude tasdiqlagan oltin signallarini va Claude'ning o'z savdolarini
  egasining MT5 hisobida avtomatik ochadi (Exness, XM va boshqalar), risk 1%, TP1 da yarmi, ergashuvchi SL, vaqt bo'yicha yopish.
  Standart holatda faqat demo hisobda ishlaydi.
- `/api/ea`: EA uchun himoyalangan signal manzili (`EA_KEY`). Admin panelda "MT5 avtosavdo" sahifasi: holat va o'rnatish yo'riqnomasi.

## v1.0.0 (2026-10-10): Claude boshqaruvidagi birinchi to'liq versiya

**Robotlar**
- Zeus: oltin M15 trend strategiyasi (EMA20/EMA50, ADX ≥ 20, H1 tasdig'i, RSI pullback). Sinov: 39 savdo, 90% yutuq, o'rtacha +0.36R, PF 4.37.
- Oltin chiqishi: TP1 0.5R da yarmi yopiladi, so'ng 1 ATR ergashuvchi SL, TP2 1.5R, 8 soatda yopish.
- Gerakl (skalping) o'chirilgan; kripto standart bozorlardan chiqarilgan (sinovda zarar).

**Claude (sun'iy intellekt)**
- Oltin signali mijozga faqat Claude tasdiqlasa chiqadi ("tasdiq"/"ehtiyot"), tasdiqlangan signal ostida Claude izohi.
- Claude AI treyder: oltinda o'zi demo savdo qiladi (har 2 soatda), natija Zeus bilan solishtiriladi.
- Robot + Claude tahlili: barcha juftliklar uchun strategiya, trendlar, talab/taklif zonalari, darajalar, ssenariy.
- Valyutalar faqat admin sinovida; juftliklar bo'yicha natija jadvali.
- Kunlik AI chegarasi (40 chaqiruv, ~$50/oy).

**Sayt**
- Bosh sahifa: kun/tun rejimi, logo, 3D shamlar, 3D tariflar (Standart 19, PRO 39, VIP 79 USDT/oy).
- "Robot haqida" sahifasi, Natijalar, Kabinet, AI operator.
- Admin panel: Robot + Claude, AI treyder, har signalning to'liq tahlili, TradingView uslubidagi grafiklar (M5–H4).

**Ochiq ishlar**: CLAUDE.md oxiridagi ro'yxatga qarang.
