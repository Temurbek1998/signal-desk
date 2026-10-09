# Oltin (XAU/USD) bo'yicha tarixiy sinov — 2026-10-09

## Ma'lumot

- Manba: PAXG/USDT 15 daqiqalik shamlari (Binance). PAXG — 1 unsiya oltinga bog'langan token, narxi spot XAU/USD ga
  juda yaqin yuradi, lekin aynan bir xil emas.
- Davr: 2026-06-06 — 2026-10-09, 12 000 sham, uzilish yo'q. Oltin bozori yopiq soatlar (dam olish kunlari,
  har kuni 21:00–22:00 UTC) olib tashlandi: 8 208 sham, 123 kun.
- Narx oralig'i: 3 945 — 4 689. Davr ichida o'sish (avgust oxiri cho'qqi) va pasayish bor.
- Xarajat: har tomonga 0.01% (spred), ya'ni kirish+chiqish 0.02%.
- Sinov ikki yarim davrga bo'lib ham tekshirildi (h1, h2). Sozlama faqat ikkala yarimda ham ijobiy bo'lsa qabul qilinadi.

## Sinalgan variantlar (216 ta)

Taymfreym (M15, M30, H1) × sessiya (24 soat, London+NY 07–20, NY 12–20) × ADX (≥20, ≥25) × SL (1.5, 2, 2.5, 3 ATR)
× TP (0.5R/1.5R, 1R/2R, 1R/3R). Qo'shimcha: yuqori taymfreym tasdig'isiz va ADX filtrisiz variantlar.

## Asosiy natijalar (xarajat bilan)

| Taymfreym | Sozlama | Savdo | Kuniga | Win rate | O'rtacha R | PF | 1-yarim | 2-yarim |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **M15** | **24 soat, ADX≥20, SL 2.5 ATR, TP 0.5R/1.5R (tanlandi)** | 38 | 0.31 | 87% | +0.224 | 2.64 | +0.357 | +0.092 |
| M15 | 24 soat, ADX≥20, SL 2 ATR, TP 0.5R/1.5R (oldingi) | 43 | 0.35 | 81% | +0.195 | 2.00 | +0.246 | +0.138 |
| M15 | London+NY 07–20, SL 2.5 ATR | 28 | 0.23 | 86% | +0.247 | 2.67 | +0.395 | +0.077 |
| M30 | 24 soat, ADX≥20, SL 2 ATR (oldingi) | 43 | 0.35 | 60% | −0.109 | 0.74 | −0.122 | −0.129 |
| H1 | 24 soat, ADX≥20, SL 2 ATR | 21 | 0.17 | 67% | −0.085 | 0.75 | −0.047 | −0.127 |

Filtrlarni yumshatish (ADX 15 yoki o'chiq, yuqori taymfreym tasdig'isiz) signal sonini ko'paytirmadi
(eng ko'pi kuniga ~0.4) va natijani yomonlashtirdi.

## Robotga qo'yilgan o'zgarishlar

1. Oltinda SL 2.5 ATR (kripto va forexda 2 ATR qoladi). `SL_ATR_BY_CATEGORY`.
2. Oltinda faqat M15 signallari kuchli. M30 va H1 ikkala yarim davrda ham zarar berdi, ular faqat adminga
   (C/kuchsiz) ko'rinadi. `GOLD_STRONG_TF`.
3. Komissiya filtri endi haqiqiy SL masofasi bilan hisoblanadi.

## Katta taymfreymlar: H4, kunlik, haftalik, oylik (2026-10-09)

Robot endi M5–H1 dan tashqari H4, kunlik (D1), haftalik (W1) va oylik (MN) trendni ham kuzatadi
(`scripts/htf-context.ts`). Tarix: oylik 2020-08 dan, haftalik 2023-01 dan, kunlik 2025-12 dan (PAXG), davomi 15 daqiqalikdan.
Trend: EMA20 va EMA50 (faqat yopilgan shamlar). Har M15 signali katta trend bilan solishtirildi:

| Katta trend signalga nisbatan | Savdo | Win | O'rtacha R |
| --- | --- | --- | --- |
| Hammasi | 38 | 87% | +0.224 |
| D1 mos | 18 | 78% | +0.185 |
| D1 qarshi | 12 | 100% | +0.334 |
| W1 mos | 9 | 78% | +0.100 |
| W1 qarshi | 16 | 94% | +0.229 |
| MN mos | 14 | 86% | +0.191 |
| MN qarshi | 24 | 88% | +0.244 |
| H4, D1, W1, MN dan kamida 2 tasi mos | 7 | 71% | −0.039 |
| D1 qarshi emas (filtr) | 26 | 81% | +0.174 |

Xulosa: bu davrda (oltin iyun–oktabr, keng yon harakat) katta trend bilan mos kelish natijani **yaxshilamadi**,
aksincha qarshi signallar yaxshiroq chiqdi. Shuning uchun katta trend filtr sifatida qo'yilmadi: u admin sahifasida
("Bozor manzarasi"), signal sabablarida va Telegram xabarida ko'rsatiladi. Namuna kichik (38 savdo), jonli natija
yig'ilgach qayta tekshiriladi.

Oylik natija (joriy robot): iyun 10 savdo 100% (+0.52R), iyul 8 savdo 75% (+0.18R), avgust 9 savdo 78% (+0.02R),
sentabr 10 savdo 90% (+0.16R). Zararli hafta: 16 haftadan 4 tasi.

Yillik manzara: oltin 2020–2023 yillar 1 600–2 100 oralig'ida, 2024–2026 yanvar kuchli o'sish (5 650 gacha),
2026 fevral–iyun pasayish (3 945 gacha), iyul–oktabr 4 000–4 700 oralig'ida.

## 300–400 pips maqsadli strategiyalar (2026-10-09)

Talab: signal ko'proq bo'lsin va har savdo 300–400 pips (30–40 USD) ga mo'ljallansin. `scripts/gold-pips.ts`,
1 pip = 0.10 USD, har savdoga 5 pips xarajat, kun oxirida (21:00 UTC) ochiq savdo yopiladi. 123 kun.

| Strategiya | Savdo | Kuniga | Win | Jami pips | Oyiga | 1-yarim | 2-yarim | Max pasayish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **London breakout: 00–07 UTC oralig'i, 07–13 da yorib o'tsa, SL 200, TP 400** | 65 | 0.53 | 46% | +2 792 | +680 | +1 054 | +1 738 | 1 266 |
| London breakout, SL 200, TP 300 | 65 | 0.53 | 48% | +1 271 | +310 | +154 | +1 118 | 1 366 |
| **M15 pullback (ADX va H1 filtrisiz), SL 200, TP 300** | 120 | 0.97 | 50% | +3 862 | +940 | +2 516 | +1 346 | 1 434 |
| M15 pullback (joriy filtrlar), SL 200, TP 300 | 39 | 0.32 | 51% | +1 281 | +312 | +2 038 | −757 | 972 |
| Nyu-York breakout (13:00) | 60 | 0.49 | 28–37% | zarar | | | | |
| M30 va H1 pullback, fiks pips | | | 29–47% | asosan zarar | | | | |

Xulosa: 300–400 pips maqsad bilan win rate 87% dan ~50% ga tushadi (SL 200 pips, TP 300–400 pips: yutuq
zarardan katta, shuning uchun 50% da ham foyda). Ikkala yarim davrda ham foydali chiqqan ikki strategiya:
London breakout (kuniga ~0.5) va filtrsiz M15 pullback (kuniga ~1). Birgalikda kuniga ~1.5 signal.
Bu 216+ variant ichidan tanlangan: haddan tashqari moslashish xavfi bor, avval demo hisobda tekshirish kerak.

Qaror (Bek, 2026-10-09): "Ikkalasi birga". Trend signallari o'zgarmaydi, ikkala pips strategiyasi robotga qo'shildi
(`src/lib/pips.ts`). Jonli kod shu ma'lumotda tekshirildi: pullback 119 savdo, +3 800 pips; London 65 savdo, +2 812 pips
(kun oxiri 20:45 UTC da yopilgani uchun sinovdan biroz farq qiladi).

## Gerakl: skalping va razgon (2026-10-09)

Talab (Bek): alohida skalping roboti, nomi Gerakl; asosiy robot Zeus. `scripts/gold-scalp.ts`, PAXG/USDT M5,
2026-09-09 – 10-09 (30 kun, 8 640 sham; M15 ma'lumoti bilan solishtirildi, mos keldi). Har savdoga 5 pips xarajat
(spred + komissiya + sirpanish), 2 soatlik vaqt to'xtashi. 3 xil kirish × 6 SL/TP × 3 sessiya = 90+ variant.

| Variant (kun bo'yi) | Savdo | Kuniga | Win | Jami pips | O'rtacha | 1-yarim | 2-yarim | Max pasayish |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Razgon 3 ATR, SL 80, TP 150 (tanlandi)** | 29 | 1.0 | 48% | +580 | +20 | +347 | +232 | 255 |
| Razgon 3 ATR, SL 100, TP 200 | 29 | 1.0 | 45% | +545 | +19 | +283 | +262 | 315 |
| Razgon 3 ATR, SL 80, TP 80 | 29 | 1.0 | 62% | +415 | +14 | +90 | +325 | 190 |
| Razgon 2 ATR, SL 80, TP 150 | 114 | 3.8 | 42% | +802 | +7 | +736 | +66 | 550 |
| Razgon 2.5 ATR, SL 80, TP 150 | 52 | 1.7 | 40% | +153 | +3 | +24 | +130 | 585 |
| Razgon 3.5 ATR, SL 80, TP 150 | 15 | 0.5 | 33% | −192 | −13 | +35 | −227 | 469 |
| Siqilish (tor oraliqdan chiqish) | 20 | 0.7 | 45% | +354 (eng yaxshisi) | | | | |
| EMA20 ga qaytish | | | | barcha variantlar zarar | | | | |
| Faqat 07–17 yoki 12–17 UTC | | | | deyarli hammasi zarar | | | | |

Xarajat 3 pips bo'lsa tanlangan variant +638 pips. 2 ATR variant kuniga ~4 savdo beradi, lekin har savdoda
o'rtacha +7 pips: spred 2 pips oshsa foyda yo'qoladi, ikkinchi yarmi deyarli nol.

Halol xulosa: skalpingda xarajat natijani hal qiladi. Tanlangan variant faqat 29 savdo, chegarasi tor (2.5 va 3.5 ATR
ancha yomon) va xuddi shu qoida M15 da (123 kun) zarar beradi. Shuning uchun Gerakl hozircha faqat admin va demo
hisobda ishlaydi (reyting C). Demo natijasi yaxshi chiqsa `GERAKL_PUBLIC=1` bilan mijozlarga ochiladi.

## Cheklovlar

- **Signal soni kam:** oltinda kuchli M15 signali o'rtacha kuniga 0.3 ta, ya'ni haftasiga taxminan 2 ta.
  Mijozlarga "kuniga 1–2" va'da qilish bu ma'lumotga mos kelmaydi.
- **Namuna kichik:** 38 savdo. 87% win rate ishonch oralig'i keng (taxminan 72–95%). Jonli natija va demo hisob
  bilan tekshirib borish kerak.
- PAXG spot oltin emas: dam olish kunlari ham savdo qilinadi, spred va hajm boshqacha.
- Yangiliklar (NFP, CPI, FOMC) filtri tarixiy sinovda hisobga olinmagan: tarixiy kalendar yo'q. Jonli robotda
  yangilik oldidagi signallar baribir kuchsiz deb belgilanadi.
- O'tgan natija kelajakni kafolatlamaydi.

## Qayta ishga tushirish

```
node --experimental-strip-types scripts/gold-backtest.ts paxg_15m.csv
```
