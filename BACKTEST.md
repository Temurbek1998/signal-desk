# Robot backtest natijalari

Sinov sanasi: 2026-10-09. Robotning ikkinchi versiyasi. Skript: `scripts/backtest.ts`.

## Ma'lumotlar

- **Kripto**: Binance'ning 10 ta juftligi, 5 daqiqalik shamlar (ADA, ETC, ETH, LTC, TRX, XLM, XMR, ZEC, UNITTEST/BTC
  2018-yil 10–30 yanvar, XRP/USDT 2019-yil 7 kun). M15, M30, H1 shu shamlardan yig'ilgan.
- **Valyuta**: EUR/USD, 1 soatlik, 2017-04-19 dan 2018-02-07 gacha (5000 sham).
- **Oltin**: tarixiy ma'lumot topilmadi, sinalmadi.

Bu ma'lumotlar kichik va eski. Ishonchli xulosa uchun so'nggi 1–2 yillik Binance va forex shamlari kerak.

## Hisoblash qoidalari

- Kirish signal shami yopilgan narxda. Bitta juftlikda bir vaqtda bitta savdo.
- TP1 urilsa pozitsiyaning yarmi yopiladi va SL kirish narxiga ko'chiriladi; qolgan yarmi TP2 yoki kirish narxida yopiladi.
- Bitta shamda ham SL, ham TP bo'lsa SL hisoblanadi. Asosiy jadvallar komissiyasiz; komissiya bilan natija pastdagi bo'limda.
- **Win rate** = TP1 ga SL dan oldin yetgan savdolar ulushi. **O'rtacha R** = bir savdodagi o'rtacha foyda, risk birligida
  (−1 = to'liq SL). **Profit factor** 1 dan katta bo'lsa strategiya foydada.

## Xulosa

- Birinchi versiya (MACD kesishuvi) foyda bermadi: profit factor 1 dan past, win rate 36–53%.
- Ikkinchi versiyada robot chuqurroq tekshiradi: trend (EMA20/EMA50), trend kuchi (ADX ≥ 20), yuqori taymfreym
  trendi majburiy mos kelishi, pullback tugashi (RSI) va ATR asosidagi SL. 21 ta qoida va daraja to'plami sinaldi,
  quyidagisi ikkala yarmida ham M15 va M30 da barqaror ijobiy chiqdi.
- **M5 hech qaysi variantda foyda bermadi.** M5 signallari shovqinli, ehtiyot bo'lish kerak.
- **H1** da ma'lumot juda kam (kriptoda 12 ta savdo), EUR/USD H1 da esa yangi qoidalar zararda chiqdi (profit factor 0.73).
- Savdolar soni kam (har taymfreymda 20–70 ta), shuning uchun bu natijalar katta ma'lumotda tasdiqlanishi shart.

## Komissiya bilan (2026-10-09)

Demo hisob kriptoda komissiya foydaning katta qismini olishini ko'rsatgandan keyin backtest komissiya bilan qayta
hisoblandi: kirish va chiqishda 0.04% dan (Binance futures taker), 10 kripto juftlik, 54 ta SL/TP varianti.

Komissiya risk birligida SL masofasiga bog'liq: `2 × 0.04% ÷ (SL masofasi / narx)`. Sinov ma'lumotidagi 2018-yil
altkoinlari juda volatil bo'lgani uchun u yerda xarajat savdo boshiga atigi 0.03–0.06R. Hozirgi BTC kabi tinch bozorda
M15 da SL 2 ATR taxminan 0.3–0.5% bo'ladi va xarajat 0.15–0.25R gacha chiqadi (bu baho, jonli ma'lumotda o'lchanmagan).

| Variant | Taymfreym | Savdolar | Win rate | O'rtacha R, komissiyasiz | Komissiya bilan | PF | 1-yarm / 2-yarm (komissiya bilan) |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Joriy: SL 2 ATR, TP 0.5R/1.5R | M15 | 126 | 73% | +0.067 | +0.025 | 1.09 | +0.059 / +0.031 |
| Joriy: SL 2 ATR, TP 0.5R/1.5R | M30 | 62 | 73% | +0.052 | +0.021 | 1.07 | +0.120 / +0.020 |
| SL 1.5 ATR, TP 1R/3R | M30 | 58 | 60% | +0.190 | +0.148 | 1.36 | +0.269 / +0.100 |
| SL 3 ATR, TP 1R/2R | M15 | 66 | 59% | +0.159 | +0.135 | 1.32 | −0.036 / +0.249 |

Xulosalar:

- Joriy sozlama komissiyadan keyin ham ikkala yarmida ijobiy, lekin ustunlik kichik: savdo boshiga taxminan +0.06R.
  Demak xarajati 0.06R dan katta bo'lgan har qanday savdo kutilgan zarar beradi.
- Shu sababli robotga **komissiya filtri** qo'shildi: taxminiy xarajat (kripto 0.04%, oltin 0.01%, forex 0.005%
  bir tomonga) riskning 5% idan oshsa signal berilmaydi (`ROBOT_MAX_FEE_R`). Sinov ma'lumotida bu M15 da savdolarni
  126 tadan 88 taga kamaytirdi va komissiya bilan natijani +0.025R dan +0.048R ga (PF 1.17) ko'tardi.
  Tinch kripto bozorida filtr ko'p signalni to'xtatadi; oltin va forexga deyarli ta'sir qilmaydi.
- M30 da SL 1.5 ATR, TP 1R/3R ikkala yarmida ham joriydan foydaliroq, lekin win rate 73% dan 60% ga tushadi.
  Hali joriy qoidaga almashtirilmadi.
- M15 da SL 3 ATR varianti yarmlarda barqaror emas, tanlanmadi.

## Kuchli signallar rejimi

Saytda standart holatda faqat "kuchli" signallar ko'rsatiladi: M15 (barcha filtrlar) va M30 (barcha filtrlar va
ishonch ≥ 75%), muhim yangilik oldidan emas. Qattiqroq filtrlar ham sinaldi (ishonch ≥ 80/85%, ADX ≥ 25/30), lekin
ular ikkala yarmida barqaror yaxshilanish bermadi va savdolar soni juda kamayib ketdi (5–20 ta), shuning uchun tanlanmadi.

| Taymfreym | Shart | 1-yarm | 2-yarm |
| --- | --- | --- | --- |
| M15 | barcha filtrlar | 55 savdo, win 67%, PF 1.10 | 67 savdo, win 75%, PF 1.26 |
| M30 | barcha filtrlar + ishonch ≥ 75% | 19 savdo, win 79%, PF 1.88 | 30 savdo, win 77%, PF 1.25 |

90–95% win rate'ga hech bir sinalgan sozlama barqaror yetmadi.

# Kripto, butun davr

## Joriy robot: pullback + ADX ≥ 20 + yuqori taymfreym, SL 2 ATR, TP 0.5R/1.5R

| Taymfreym | Savdolar | Win rate (TP1) | TP2 | O'rtacha R | Profit factor |
| --- | ---: | ---: | ---: | ---: | ---: |
| M5 | 491 | 54% | 12% | -0.23 | 0.50 |
| M15 | 144 | 72% | 19% | 0.04 | 1.16 |
| M30 | 71 | 73% | 18% | 0.05 | 1.20 |
| H1 | 12 | 75% | 0% | -0.06 | 0.75 |

## Joriy qoidalar, TP 1R/2R va SL 1.5 ATR bilan

| Taymfreym | Savdolar | Win rate (TP1) | TP2 | O'rtacha R | Profit factor |
| --- | ---: | ---: | ---: | ---: | ---: |
| M5 | 519 | 33% | 13% | -0.37 | 0.45 |
| M15 | 150 | 45% | 21% | -0.11 | 0.79 |
| M30 | 68 | 62% | 24% | 0.16 | 1.42 |
| H1 | 12 | 50% | 17% | -0.08 | 0.83 |

## Birinchi versiya: MACD kesishuvi, SL 1.5 ATR, TP 1R/2R

| Taymfreym | Savdolar | Win rate (TP1) | TP2 | O'rtacha R | Profit factor |
| --- | ---: | ---: | ---: | ---: | ---: |
| M5 | 1357 | 36% | 16% | -0.29 | 0.54 |
| M15 | 450 | 45% | 22% | -0.11 | 0.81 |
| M30 | 212 | 53% | 22% | 0.02 | 1.04 |
| H1 | 92 | 45% | 22% | -0.11 | 0.79 |

## Birinchi versiya, SL 2 ATR, TP 0.5R/1.5R

| Taymfreym | Savdolar | Win rate (TP1) | TP2 | O'rtacha R | Profit factor |
| --- | ---: | ---: | ---: | ---: | ---: |
| M5 | 1255 | 58% | 14% | -0.17 | 0.60 |
| M15 | 424 | 64% | 20% | -0.06 | 0.85 |
| M30 | 226 | 69% | 19% | 0.00 | 1.00 |
| H1 | 89 | 70% | 17% | -0.00 | 0.99 |

# Kripto, birinchi yarmi (2018-01-10 – 01-20)

## Joriy robot: pullback + ADX ≥ 20 + yuqori taymfreym, SL 2 ATR, TP 0.5R/1.5R

| Taymfreym | Savdolar | Win rate (TP1) | TP2 | O'rtacha R | Profit factor |
| --- | ---: | ---: | ---: | ---: | ---: |
| M5 | 207 | 55% | 16% | -0.19 | 0.57 |
| M15 | 55 | 67% | 25% | 0.03 | 1.10 |
| M30 | 24 | 79% | 25% | 0.18 | 1.85 |

# Kripto, ikkinchi yarmi (2018-01-20 – 01-30)

## Joriy robot: pullback + ADX ≥ 20 + yuqori taymfreym, SL 2 ATR, TP 0.5R/1.5R

| Taymfreym | Savdolar | Win rate (TP1) | TP2 | O'rtacha R | Profit factor |
| --- | ---: | ---: | ---: | ---: | ---: |
| M5 | 264 | 54% | 9% | -0.26 | 0.44 |
| M15 | 67 | 75% | 18% | 0.07 | 1.26 |
| M30 | 35 | 74% | 17% | 0.06 | 1.22 |

# EUR/USD (H1)

## Joriy robot: pullback + ADX ≥ 20 + yuqori taymfreym, SL 2 ATR, TP 0.5R/1.5R

| Taymfreym | Savdolar | Win rate (TP1) | TP2 | O'rtacha R | Profit factor |
| --- | ---: | ---: | ---: | ---: | ---: |
| H1 | 49 | 57% | 22% | -0.12 | 0.73 |

## Joriy qoidalar, TP 1R/2R va SL 1.5 ATR bilan

| Taymfreym | Savdolar | Win rate (TP1) | TP2 | O'rtacha R | Profit factor |
| --- | ---: | ---: | ---: | ---: | ---: |
| H1 | 56 | 30% | 18% | -0.37 | 0.47 |

## Birinchi versiya: MACD kesishuvi, SL 1.5 ATR, TP 1R/2R

| Taymfreym | Savdolar | Win rate (TP1) | TP2 | O'rtacha R | Profit factor |
| --- | ---: | ---: | ---: | ---: | ---: |
| H1 | 125 | 52% | 24% | 0.02 | 1.04 |

## Birinchi versiya, SL 2 ATR, TP 0.5R/1.5R

| Taymfreym | Savdolar | Win rate (TP1) | TP2 | O'rtacha R | Profit factor |
| --- | ---: | ---: | ---: | ---: | ---: |
| H1 | 127 | 65% | 20% | -0.03 | 0.91 |
