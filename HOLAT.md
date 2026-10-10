# Zeus Number One: joriy holat (2026-10-10)

Yangi chat shu fayldan (HOLAT.md) va CLAUDE.md dan boshlasin. Egasi (Bek) bilan o'zbek tilida (lotin) gaplashiladi.

## Asosiy ma'lumot
- Sayt: https://signal-desk-vert.vercel.app (saytdagi nomi "Zeus Number One")
- Repo: github.com/Temurbek1998/signal-desk, branch `main` (har push Vercel'da avtomatik deploy)
- Loyiha qo'llanmasi: repodagi `CLAUDE.md`, o'zgarishlar tarixi: `CHANGELOG.md`
- Oxirgi versiya: **v1.10.0** (barcha o'zgarishlar main da, ishlanmagan narsa yo'q)

## Shu chatda qilinganlar (v1.2.0 – v1.9.1)
- Operator: faqat DeepSeek yoki bepul Gemini (Claude emas), faqat platforma savollari, signal/narx aytmaydi.
  Muammo bo'lsa "Adminga murojaat" tugmasi, murojaatlar admin "Operator" sahifasida.
- Admin "Signal pulti": barcha juftliklar, texnik tahlil, kirish/SL/TP1/TP2, kirish taymeri, grafik.
- Narx: bitta tarif, 20 USDT/oy, kuniga 6 tagacha A/B signal (soni kafolatlanmaydi).
- Brend: "Zeus Number One".
- Har juftlikda alohida Claude treyder (demo): oltin har 2 soatda (Opus), 6 valyuta har 4 soatda (Sonnet).
  Ishonch 60% va yuqori qarorlar demo hisobga kiradi. MT5 keyinroq.
- Swing rejim (v1.9.0): har juftlikda kuniga bitta 3-5 kunlik qaror, oltinda 700-1000 pips maqsad, faqat demo.
- v1.9.1: mijoz ko'radigan joylarda "Claude" so'zi yo'q. Robot "Zeus", tekshiruv "ikki bosqichli maxsus tekshiruv".
  "Odamlar/personal tekshiradi" deb yozilmaydi (noto'g'ri va'da bo'ladi). Admin panelda Claude nomi qoladi.

- v1.10.0: Claude ochiq savdolarni har soatda qayta ko'radi (ushlab turish / SL ni yaqinlashtirish / yopish), har tekshiruv
  "Claude nazorat logi"da. Claude ko'proq kiradi: oltin har soat, valyutalar har 2 soat, juftlikda 2 tagacha ochiq savdo.
  Admin "Jonli savdolar": oltin va har valyuta alohida, SL qayerda, necha pips yurdi, qancha USDT (Claude va Zeus solishtirib).

## Egasi bilan kelishilgan qoidalar
- Kalit va parollar chatga yoki repoga yozilmaydi, faqat Vercel Environment Variables (Bek o'zi qo'yadi).
- "Garant" va kafolatlangan yutuq foizi yo'q.
- Valyuta signallari mijozlarga faqat isbotdan keyin ochiladi (kamida 20 yopilgan, natija ijobiy).
- Narx oshirish faqat 3+ oy barqaror jonli natijadan keyin.
- Commit xabarlari o'zbekcha. MT5 login so'ralmaydi, MT5 standart holatda faqat demo.

## Xarajat
- v1.10.0 dan kunlik chegara `AI_DAILY_CALLS` = 250 (oldin 70, ~$60-65/oy edi). Bek "byudjet ko'taradi" dedi.
  Eng ko'p holatda xarajat taxminan 3.5 baravar (~$200-230/oy, taxmin). Claude Console limitini shunga moslash kerak.

## Bek qilishi kerak (ochiq)
- Vercel'ga `DEEPSEEK_API_KEY` yoki `GEMINI_API_KEY` (operator uchun).
- Claude Console limitini v1.10.0 xarajatiga moslab oshirish.
- `EA_KEY` va MT5 EA o'rnatish/kompilyatsiya.
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ADMIN_CHAT_ID`.
- `CRON_SECRET` ni almashtirish (cron-job.org da ham), Neon parolini yangilash, Vercel 2FA, `ADMIN_PATH` ni almashtirish, Brevo kaliti.

## Keyingi qadamlar
- Dushanba (2026-10-12) bozor ochilgach: /api/health orqali birinchi Claude qarorlari va swing qarorlarini tekshirish.
- 2-4 hafta: Claude treyder, swing va Zeus natijalarini solishtirish; valyutalarni ochish masalasi natijaga qarab.
- Birinchi haftada "Jonli savdolar" va Claude nazorat logini kuzatish: SL ko'chirish va yopishlar foyda beryaptimi.
- Eskirgan remote branch `wip/har-juftlik-claude-treyder` qolgan, o'chirish mumkin.
