# Signal Desk

Kripto, oltin (XAU/USD) va valyuta juftliklari uchun avtomatik signal sayti.
Robot har bir juftlikni M5, M15, M30 va H1 taymfreymlarida tahlil qiladi va
BUY/SELL signalini kirish narxi, TP 1, TP 2 va SL bilan beradi.

## Robot qanday ishlaydi

Har bir yopilgan shamda quyidagilar tekshiriladi (`src/lib/engine.ts`):

| Qadam | Qoida |
| --- | --- |
| Trend | EMA20 > EMA50 va narx EMA50 dan yuqori bo'lsa trend yuqoriga (SELL uchun teskarisi) |
| Kirish | Trend ichidagi pullback tugashi: RSI 45 dan pastga tushib qaytgan (SELL uchun 55 dan yuqoriga chiqib qaytgan) |
| Filtr | ADX(14) ≥ 20 va yuqori taymfreym trendi majburiy bir xil yo'nalishda |
| Yuqori taymfreym | M5→M15, M15→H1, M30→H1, H1→H4 |
| Komissiya filtri | Taxminiy savdo xarajati riskning 5% idan oshsa (harakat juda kichik) signal berilmaydi, `ROBOT_MAX_FEE_R` |
| Darajalar | SL = kirish ± 2 × ATR(14) (oltinda 2.5 × ATR), TP 1 = 0.5R, TP 2 = 1.5R |
| Katta trend | H4, kunlik, haftalik, oylik trend kuzatiladi va har signalda ko'rsatiladi (filtr emas), `market_context` jadvali |
| Oltin | Faqat M15 signallari kuchli (M30 va H1 oltin sinovida zarar bergan), batafsil [GOLD_BACKTEST.md](GOLD_BACKTEST.md) |

So'nggi 20 sham ichidagi eng yangi signal ko'rsatiladi va keyingi shamlar bo'yicha
natijasi kuzatiladi: Faol, TP 1 urildi, TP 2 urildi yoki SL urildi.

Signallar moliyaviy maslahat emas, robot foydani kafolatlamaydi.

## Oltin: 300–400 pips rejimi

Asosiy (trend) signallarga qo'shimcha ravishda oltinda M15 shamlarda ikki pips strategiyasi ishlaydi (`src/lib/pips.ts`):

| Strategiya | Kirish | SL | TP | Sinovda (123 kun) |
| --- | --- | --- | --- | --- |
| Pips: pullback | Trend ichidagi pullback, ADX va H1 filtrisiz | 200 pips | 300 pips | kuniga ~1, win 50%, oyiga ~+940 pips |
| Pips: London | 00:00–07:00 UTC oralig'i 07:00–13:00 da yorib o'tilsa, kuniga bitta | 200 pips | 400 pips | kuniga ~0.5, win 46%, oyiga ~+680 pips |

Ochiq pips savdo har kuni 20:45 UTC da yopiladi ("Kun oxiri"). Jurnalda `strategy` ustuni bilan ajratiladi,
reyting alohida xotiradan (`ratePips`): kutilgan win rate 40% dan past bo'lsa C. Demo hisob sahifasida
"Strategiyalar bo'yicha" jadvali, Telegram xabarida strategiya nomi va bitta TP ko'rinadi. Batafsil: GOLD_BACKTEST.md.

## Gerakl: skalping roboti

Ikki robot bor: **Zeus** (trend va 300–400 pips rejimlari) va **Gerakl** (skalping/razgon, oltin M5, `src/lib/scalp.ts`).
Gerakl M5 shami tanasi ATR ning 3 baravaridan katta bo'lib, cho'qqi yoki tubida yopilsa impuls tomonga kiradi:
SL 80 pips, TP 150 pips, 2 soatda yoki 20:45 UTC da yopiladi. Sinov kichik (30 kun, 29 savdo, GOLD_BACKTEST.md),
shuning uchun signallari standart holatda faqat admin, Telegram va demo hisobga boradi. Mijozlarga ochish:
`GERAKL_PUBLIC=1`. Saytda, demo hisobda, natijalar sahifasida va Telegramda har signal qaysi robotdan ekani yoziladi.

## Yangiliklar ogohlantirishi

Iqtisodiy kalendar Forex Factory'dan olinadi (bepul, kalit kerak emas, 30 daqiqada bir yangilanadi).
Yuqori ta'sirli yangiliklar (NFP, CPI, FOMC, markaziy bank stavkalari va boshqalar) saytning tepasida
vaqti va ta'sir qiladigan juftliklar bilan ko'rsatiladi. USD yangiliklari oltin va barcha USD juftliklariga,
EUR yangiliklari EUR/USD ga va hokazo ta'sir qiladi.

- Yangilikdan 1 soat oldin va 30 daqiqa keyin shu juftliklardagi signallarda "Yangilik xavfi" belgisi chiqadi.
- "Bildirishnomani yoqish" tugmasi bosilsa, brauzer yangilikdan 15 daqiqa oldin va chiqqan paytda xabar beradi
  (sayt ochiq turgan bo'lishi kerak).

## Tariflar va robot xotirasi

Mijozlarga kuniga eng ko'pi bilan 2 ta eng aniq signal beriladi (ba'zi kunlari umuman bo'lmaydi). Tariflar reyting
bo'yicha farqlanadi. Admin esa robotning barcha kuchli signallarini (C reytingli ham) saytda va Telegramda darhol oladi.

| Daraja | Kunlik chegara | Reyting |
| --- | --- | --- |
| Standart | kuniga 2 tagacha | faqat A |
| PRO | kuniga 2 tagacha | A va B |
| VIP | kuniga 2 tagacha | A va B |
| Admin | cheklovsiz + Telegram xabari | A, B, C |

### Admin Telegram xabarlari

Robot yangi kuchli signal yozishi bilan (va signal TP/SL bilan yopilganda) adminga Telegram xabari boradi:
juftlik, BUY/SELL, kirish, TP1, TP2, SL, reyting, ishonch va sabablar.

1. Telegramda @BotFather ga `/newbot` yozing, bot token oling: `TELEGRAM_BOT_TOKEN`.
2. O'z botingizga `/start` yozing, keyin @userinfobot dan chat id ni oling: `TELEGRAM_ADMIN_CHAT_ID`
   (bir nechta admin bo'lsa vergul bilan).
3. `ROBOT_SELF_SCHEDULE=1` bilan robot har 5 daqiqalik sham yopilishidan 5 soniya keyin ishga tushadi,
   signal topilsa xabar 1 soniya ichida yuboriladi.

Ishga tushgan dastlabki kunlarda xotira bo'sh bo'ladi: juftlik bo'yicha 10 ta signal yig'ilguncha A reyting faqat
ishonchi 75% va undan yuqori signalga beriladi, qolganlari B.

Kun Toshkent vaqti bilan hisoblanadi; signallar kun davomida paydo bo'lish tartibida beriladi. Limitdan oshgan
yoki PRO va VIP uchun bo'lgan B signal standart obunachiga qulflangan karta sifatida ko'rinadi.

Robot xotirasi (`src/lib/memory.ts`): har bir yangi kuchli signalga shu juftlik+taymfreym va shu taymfreym+yo'nalish
bo'yicha so'nggi 60 kundagi yopilgan signallar natijasidan reyting beriladi. Boshlang'ich baho tarixiy sinovdagi 72%
(10 ta virtual signal og'irligida), jonli natija to'plangan sari baho haqiqiy natijaga yaqinlashadi. A: kutilgan
natija ≥ 74% va ishonch ≥ 70%; B: ≥ 64%; C: qolganlari. 12 tadan ko'p signalda yutuq 50% dan past bo'lsa,
juftlik vaqtincha bloklanadi (C). Xotira jadvali `/admin/robot` da.

## Robot 24 soat ishlashi va admin kuzatuvi

Robot har 5 daqiqada barcha juftlik va taymfreymlarni tahlil qiladi. Ikki usuldan biri kerak:

- **O'z serveringiz (VPS)**: `ROBOT_SELF_SCHEDULE=1` bilan `npm run build && npm start`. Robot sayt ichida o'zi ishlaydi
  (`ROBOT_INTERVAL_MIN` bilan oraliqni o'zgartirish mumkin). Jarayon doim yoniq turishi uchun pm2 yoki systemd ishlating.
- **Vercel va boshqa serverless**: cron-job.org da har 5 daqiqada `/api/cron` ga
  `Authorization: Bearer <CRON_SECRET>` bilan so'rov sozlang.

`/admin/robot` sahifasida: robot ishlayaptimi (oxirgi aylanish 12 daqiqadan eski bo'lsa qizil ogohlantirish),
har bir juftlik va taymfreym bo'yicha oxirgi qaror va uning sababi (masalan "BUY setup bor, lekin trend kuchsiz"),
yangi va yopilgan signallar, narx olinmagan xatolar, har bir aylanish davomiyligi. "Hozir ishga tushirish"
tugmasi robotni darhol aylantiradi. Kuchsiz signallar ham shu yerda ko'rinadi, obunachilarga esa faqat kuchlilari.

## AI operator

Har bir sahifaning pastki o'ng burchagida "Operator" chati bor. U obuna, tariflar, robot qoidalari va
signallarni o'qish haqidagi savollarga javob beradi. Obunachilarga so'nggi faol signallarni ham ayta oladi,
mehmonlarga esa aniq signal aytmaydi. Foyda kafolatlamaydi va signal to'qimaydi.

- Ulash: `LLM_PROVIDER=deepseek` va `DEEPSEEK_API_KEY` (platform.deepseek.com), yoki
  `LLM_PROVIDER=anthropic` va `ANTHROPIC_API_KEY` (console.anthropic.com).
- Limit: mehmon uchun kuniga 10, Standart uchun 30, PRO uchun 45, VIP va admin uchun 60 savol. Yozishmalar `chat_log` jadvalida.
- Kalit berilmasa chat ochiladi, lekin "Operator hali ulanmagan" deb javob beradi.

## Admin panelga maxfiy kirish va ma'lumotlar bazasi

Admin panel oddiy `/admin` manzilida emas, faqat admin biladigan maxfiy manzilda ochiladi:

- `ADMIN_PATH=qwert-3f9a1c7e5b2d4a60` bo'lsa, panel `https://domen.uz/qwert-3f9a1c7e5b2d4a60` da, robot jurnali
  `.../robot` da. Oddiy `/admin` "sahifa topilmadi" qaytaradi.
- Yoki `ADMIN_HOST=qwert.domen.uz`: panel shu subdomenning bosh sahifasida. DNS'da subdomen saytga yo'naltiriladi va
  `COOKIE_DOMAIN=.domen.uz` qo'yiladi.
- Maxfiy manzilni admin bo'lmagan yoki tizimga kirmagan odam ochsa ham "topilmadi" ko'rinadi. Admin avval `/kirish` da
  kiradi, keyin maxfiy manzilni ochadi (yoki menyudagi "Admin" havolasini bosadi).
- Admin sahifalari qidiruv tizimlariga yopiq (noindex).

Barcha ma'lumot PostgreSQL bazasida saqlanadi (`db/schema.sql`):

| Jadval | Nima saqlanadi |
| --- | --- |
| `users`, `sessions`, `email_codes` | foydalanuvchilar, kirish sessiyalari, email tasdiqlash kodlari |
| `plans`, `subscriptions`, `payments` | tariflar, obunalar, USDT to'lovlar va TxID |
| `signal_log` | robotning har bir kuchli signali va natijasi (robot xotirasi shundan) |
| `robot_runs`, `robot_state`, `robot_events` | robotning har bir sikli, hozirgi holati va hodisalari |
| `demo_trades` | robotning demo hisobidagi savdolar |
| `chat_log` | AI operator bilan yozishmalar |
| `admin_log` | admin harakatlari: kirish, to'lov tasdiqlash/rad etish, qo'lda obuna, robotni ishga tushirish |

## Robot demo hisobi

Robot o'zi bergan har bir kuchli signalga (A, B va C, `DEMO_RATINGS`) virtual hisobda o'zi ham kiradi. Sahifa faqat
adminga ochiq: admin panel ichida `<maxfiy yo'l>/demo`. Unda kunlik natija (savdolar soni, foyda, zarar, komissiya,
sof natija), ochiq pozitsiyalar va to'liq savdolar tarixi: lot, kirish, TP1, TP2, SL, natija va balans.
Oltinda 1 lot = 100 unsiya, forexda 100 000. Bozor yopiq paytda (dam olish kunlari, har kuni 21:00–22:00 UTC)
robot oltin va forexni tahlil qilmaydi va yangi savdo ochmaydi; kripto 24/7.
Bu haqiqiy pul emas: boshlang'ich balans `DEMO_START_BALANCE` (standart 10 000 USDT), har savdoda balansning
`DEMO_RISK_PCT` foizi xavf ostiga qo'yiladi (standart 1%, ruxsat 0.1–5%). Pozitsiya hajmi shunga qarab SL masofasidan
hisoblanadi; TP1 da yarmi yopiladi, qolgani kirishda yoki TP2 da. Kirish va chiqish komissiyasi ayiriladi
(kripto `DEMO_FEE_CRYPTO_PCT` = 0.04%, oltin va forex `DEMO_FEE_FX_PCT` = 0.005%).

Sahifada balans, daromadlilik, yutuq ulushi, eng katta pasayish, balans egri chizig'i, ochiq pozitsiyalar va har savdoning
foyda yoki zarari ko'rinadi. Har ochilgan va yopilgan demo savdo robot jurnaliga ham yoziladi. Ma'lumot `demo_trades` jadvalida.

## Ro'yxatdan o'tish va email tasdiqlash

Ro'yxatdan faqat email orqali o'tiladi. Foydalanuvchi email va parol kiritgach, emailiga 6 xonali kod yuboriladi va hisob shu kod kiritilgandagina ochiladi. Tasdiqlanmagan hisob bilan kirib bo'lmaydi: kirishda yana kod so'raladi.

- Kod 10 daqiqa amal qiladi, 5 marta xato kiritilsa bekor bo'ladi.
- Qayta yuborish 60 soniyada bir martadan ko'p emas, soatiga ko'pi bilan 5 ta.
- Kod bazada ochiq holda saqlanmaydi (sha256).

Email yuborish `MAIL_PROVIDER` bilan tanlanadi:

| Variant | Kerakli sozlamalar | Izoh |
| --- | --- | --- |
| `resend` | `RESEND_API_KEY`, `MAIL_FROM` | resend.com, kuniga 100 ta xat bepul. Domenni tasdiqlash kerak. |
| `brevo` | `BREVO_API_KEY`, `MAIL_FROM` | brevo.com, kuniga 300 ta xat bepul. Jo'natuvchi emailni tasdiqlash kifoya. |
| `smtp` | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Masalan Gmail ilova paroli bilan (kuniga ~500 ta). |
| `console` | — | Faqat lokal sinov: kod server jurnaliga yoziladi. |

## Bozorlar va narx manbalari

Hozircha robot faqat **oltinni (XAU/USD)** kuzatadi. Kripto va valyuta juftliklari kodda saqlangan, lekin o'chirilgan;
ular `ACTIVE_CATEGORIES` bilan bosqichma-bosqich yoqiladi: `gold` (standart), `gold,forex`, `gold,forex,crypto`.
Sayt matnlari, signallar sahifasi va AI operator shu sozlamaga moslashadi.

- **Oltin**: [Twelve Data](https://twelvedata.com) orqali spot XAU/USD, `TWELVEDATA_API_KEY` bilan. **Oltin uchun bu
  majburiy**: kalitsiz Yahoo'dagi GC=F (oltin fyuchersi) olinadi, u spotdan odatda bir necha o'n dollar farq qiladi va
  kirish, TP, SL darajalari brokerdagi narxga to'g'ri kelmaydi. Robot har aylanishda bitta so'rov bilan 5000 ta M5 sham
  oladi va M15, M30, H1, H4 ni shulardan yig'adi: har 5 daqiqada ishlaganda kuniga ~290 so'rov, bepul tarifning 800 talik
  limitiga sig'adi. Kalit qo'yilmasa admin robot sahifasida ogohlantirish chiqadi.
- **Valyutalar** (yoqilganda): Twelve Data yoki Yahoo Finance.
- **Kripto** (yoqilganda): Binance (kalit kerak emas), sahifadagi jonli narxlar Binance WebSocket orqali.

## Sayt tuzilishi

| Sahifa | Kimga | Vazifasi |
| --- | --- | --- |
| `/` | hamma | Sotuv sahifasi: robot, natijalar, tariflar, savollar |
| `/natijalar` | hamma | Yopilgan signallar statistikasi (faol signallar yashirin) |
| `/royxat`, `/kirish` | hamma | Ro'yxatdan o'tish va kirish |
| `/kabinet` | foydalanuvchi | Obuna holati, to'lov so'rovi, to'lovlar tarixi |
| `/signallar` | faol obunachi | Robot signallari, yangiliklar |
| `/admin` | admin | To'lovlarni tasdiqlash, qo'lda obuna berish, foydalanuvchilar |

Ma'lumotlar bazasi: PostgreSQL, sxema `db/schema.sql` da (users, sessions, plans, subscriptions, payments,
signal_log). Sxema sayt birinchi marta ishga tushganda avtomatik yaratiladi. Tarif narxlari `plans`
jadvalida, ularni SQL orqali o'zgartirish mumkin.

To'lov faqat USDT'da. Foydalanuvchi kabinetda tarif va tarmoqni (TRC20, BEP20 yoki ERC20) tanlaydi,
ko'rsatilgan hamyonga summani o'tkazadi va tranzaksiya ID sini (TxID) yuboradi. Admin `/admin` da TxID havolasini
ochib (tronscan, bscscan, etherscan) summa va qabul qiluvchi hamyonni tekshiradi va tasdiqlaydi; obuna shu zahoti yoqiladi.
Bitta TxID ikki marta yuborilsa, qabul qilinmaydi. Hamyon manzillari `USDT_TRC20_ADDRESS`, `USDT_BEP20_ADDRESS`,
`USDT_ERC20_ADDRESS` sozlamalarida, tarif narxlari `plans.price_usdt` ustunida.

## Ishga tushirish

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # robot testlari
```

Internetsiz sinab ko'rish uchun sun'iy narxlar bilan: `DEMO_DATA=1 ADMIN_EMAIL=siz@mail.uz npm run dev`.
`DATABASE_URL` berilmasa ma'lumotlar `.data/` papkasidagi lokal Postgres'da (PGlite) saqlanadi.
Sozlamalar ro'yxati: `.env.example`.

## Internetga chiqarish (Vercel)

1. Bepul PostgreSQL oching (masalan neon.tech) va ulanish manzilini oling.
2. Loyihani GitHub'ga yuklang, vercel.com da "New Project" orqali repozitoriyni tanlang.
3. Environment Variables ga `.env.example` dagi qiymatlarni kiriting (kamida `DATABASE_URL`, `ADMIN_EMAIL`, `CRON_SECRET`, hamda email uchun `MAIL_PROVIDER`, `MAIL_FROM` va tanlangan servis kaliti). Email sozlanmasa, ro'yxatdan o'tib bo'lmaydi.
4. Saytda `ADMIN_EMAIL` bilan ro'yxatdan o'ting: bu hisob admin bo'ladi.
5. Signallar jurnali to'xtovsiz yozilishi uchun cron-job.org da har 5 daqiqada
   `https://saytingiz/api/cron` ga `Authorization: Bearer <CRON_SECRET>` sarlavhasi bilan so'rov sozlang.
6. Tekshirish: `https://saytingiz/api/health` bazaga ulanish holatini (`"db":"ok"` yoki xato sababini) va qaysi sozlamalar berilganini ko'rsatadi. Maxfiy qiymatlar hech qachon chiqmaydi.
   Vercel'da o'zgaruvchi o'zgartirilgach, kuchga kirishi uchun yangi deploy (Redeploy) kerak.

## Tuzilishi

```
src/lib/indicators.ts   EMA, RSI, MACD, ATR
src/lib/engine.ts       signal qoidalari va natijani kuzatish
src/lib/market.ts       Binance, Yahoo, Twelve Data dan shamlar olish
src/lib/instruments.ts  juftliklar ro'yxati
src/lib/robot.ts        barcha juftliklarni bir taymfreymda tahlil qilish
src/app/api/signals     GET /api/signals?tf=M15
src/app/page.tsx        sayt sahifasi
```

## Backtest

```bash
npm run backtest -- data/BTCUSDT-5m.csv data/EURUSD-1h.csv:60
```

CSV ustunlari: `t,o,h,l,c` (t millisekundda). Natijalar va xulosalar: [BACKTEST.md](BACKTEST.md).
