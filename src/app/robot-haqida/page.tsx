import Link from "next/link";
import Robot3D from "../components/Robot3D.tsx";

export const metadata = {
  title: "Robot haqida",
  description: "Zeus Claude roboti oltin (XAU/USD) bozorini qanday kuzatadi, qachon signal beradi va nimalarni qilmaydi.",
};

const TASKS = [
  { t: "Narxlarni yig'ish", p: "Har 5 daqiqada oltinning (XAU/USD) so'nggi narxlarini oladi va ulardan M15, M30, H1 hamda H4 shamlarini quradi. Faqat yopilgan shamlar hisobga olinadi: chizilib turgan sham bo'yicha qaror qilinmaydi.", k: "har 5 daqiqada · 24/5" },
  { t: "Trend yo'nalishini aniqlash", p: "EMA20 va EMA50 o'rtacha chiziqlari orqali bozor qayoqqa ketayotganini aniqlaydi. Trend yuqoriga bo'lsa faqat BUY, pastga bo'lsa faqat SELL izlaydi. Trendga qarshi signal berilmaydi.", k: "EMA20 / EMA50" },
  { t: "Trend kuchini tekshirish", p: "ADX ko'rsatkichi 20 dan past bo'lsa, bozor yon harakatda (flet) deb hisoblanadi va signal berilmaydi. Flet bozorda soxta signallar ko'p bo'ladi.", k: "ADX ≥ 20" },
  { t: "Katta taymfreym tasdig'i", p: "M15 signali H1 trendi bilan, H1 signali H4 trendi bilan bir xil yo'nalishda bo'lishi shart. Bundan tashqari kunlik, haftalik va oylik manzara ham kuzatib boriladi.", k: "M15→H1 · H1→H4 · D1/W1/MN" },
  { t: "To'g'ri kirish nuqtasini kutish", p: "Narx cho'qqisida sotib olmaydi. Trend ichidagi qaytish (pullback) tugashini RSI orqali kutadi: BUY uchun RSI 45 dan pastga tushib qaytishi, SELL uchun 55 dan yuqoriga chiqib qaytishi kerak.", k: "RSI pullback" },
  { t: "Risk va maqsadlarni hisoblash", p: "Stop Loss bozor tebranishiga (ATR) qarab qo'yiladi. Ikkita Take Profit bor: TP1 da savdoning yarmi yopiladi, qolgan yarmi uchun Stop Loss narx ortidan 1 ATR masofada ergashadi: narx yursa foyda himoyalanadi. Savdo TP2 da, ergashuvchi SL da yoki ko'pi bilan 8 soatda yopiladi.", k: "ATR · TP1 / TP2 · ergashuvchi SL" },
  { t: "Xarajat filtri", p: "Spred va komissiya kutilgan foydaning sezilarli qismini yeb qo'ysa, signal berilmaydi. Bu juda kichik Stop Loss bilan ochiladigan, aslida foydasiz savdolarni olib tashlaydi.", k: "komissiya ≤ 5% risk" },
  { t: "Yangiliklarni kuzatish", p: "NFP, CPI, FOMC kabi oltinni keskin silkitadigan AQSh yangiliklari yaqinlashganda signal ostida ogohlantirish chiqadi, shunda yangilik paytida bexabar qolmaysiz.", k: "NFP · CPI · FOMC" },
  { t: "Xotira va reyting", p: "Robot o'zining o'tgan signallarini eslab qoladi. Har yangi signalga o'xshash vaziyatlardagi natijaga qarab A, B yoki C reyting beradi. Biror rejim ketma-ket yomon natija bersa, u vaqtincha to'xtatiladi.", k: "A · B · C reyting" },
  { t: "Natijani ochiq yozish", p: "Har bir signal bazaga yoziladi va yopilguncha kuzatiladi: TP1, TP2, SL yoki kun oxirida yopilish. Natija avtomatik hisoblanadi va Natijalar sahifasida tanlab olinmasdan ko'rsatiladi.", k: "hammasi ochiq" },
  { t: "Demo hisobda o'zini sinash", p: "Robot o'z signallari bo'yicha virtual hisobda 1% risk bilan o'zi savdo qiladi. Bu haqiqiy pul emas, lekin strategiya amalda qanday ishlashini ko'rsatadi.", k: "virtual hisob · 1% risk" },
  { t: "Claude yakuniy qaror qiladi", p: "Robot qoidalari topgan har bir oltin signalini Zeus Claude'ning miyasi, Claude (Anthropic sun'iy intellekti) mustaqil tahlil qiladi: katta trend, talab va taklif zonalari, yaqin qarshilik darajalari. Faqat Claude tasdiqlagan signal mijozga yuboriladi, xavfli deb topilgani ushlab qolinadi. Tasdiqlangan signal ostida Claude'ning qisqa izohi ko'rinadi.", k: "Claude · ikkinchi tekshiruv" },
  { t: "Signalni yetkazish", p: "Claude tasdiqlagan signal chiqqanda u obunachilarning kabinetida darhol ko'rinadi: kirish narxi, TP1, TP2, SL, reyting va sababi bilan. Savollar bo'lsa, AI operator javob beradi.", k: "kabinet · AI operator" },
];

const CYCLE = [
  { b: "1. Narx keldi", s: "Yangi sham yopildi, robot uyg'ondi." },
  { b: "2. Bozor holati", s: "Trend, uning kuchi va katta taymfreymlar tekshiriladi." },
  { b: "3. Kirish sharti", s: "Pullback tugadimi, xarajat me'yordami, yangilik yaqinmi." },
  { b: "4. Imkoniyat", s: "Hamma shart bajarilsa Zeus Claude imkoniyat topadi, bittasi bajarilmasa kutadi. Kutish ham qaror." },
  { b: "5. Claude qarori", s: "Claude imkoniyatni mustaqil tahlil qiladi: tasdiqlasa signal mijozga boradi, rad etsa ushlab qolinadi." },
  { b: "6. Kuzatuv", s: "Ochiq signal TP yoki SL ga yetguncha har 5 daqiqada tekshiriladi." },
  { b: "7. Saboq", s: "Natija xotiraga yoziladi va keyingi signallar reytingiga ta'sir qiladi." },
];

const NOTS = [
  ["Kafolat bermaydi.", "Hech bir robot har doim yutmaydi. Shuning uchun har signalda Stop Loss bor."],
  ["Pulingizga tegmaydi.", "Robot brokeringizga ulanmaydi, savdoni siz o'zingiz ochasiz."],
  ["Trendga qarshi yurmaydi.", "Bozor teskari ketayotganda \"arzon\" yoki \"qimmat\" deb kirmaydi."],
  ["Signalni majburan chiqarmaydi.", "Shartlar mos kelmasa, bir necha soat yoki kun signal bo'lmasligi mumkin."],
];

export default function AboutRobot() {
  return (
    <main>
      <section className="about-hero">
        <div>
          <span className="eyebrow">Robot haqida</span>
          <h1>Zeus Claude: oltin bozorini <em>sizning o&apos;rningizga</em> kuzatuvchi robot</h1>
          <p className="lead" style={{ color: "var(--muted)", fontSize: "1.06rem", maxWidth: "58ch", margin: "16px 0 22px" }}>
            Zeus Claude oltin (XAU/USD) narxini kechayu kunduz kuzatadigan dastur. U his-tuyg&apos;uga berilmaydi, charchamaydi va qoidadan
            chetga chiqmaydi: faqat oldindan belgilangan barcha shartlar bir vaqtda bajarilganda signal beradi.
          </p>
          <div className="cta">
            <Link className="btn gold" href="/royxat">Obuna bo&apos;lish</Link>
            <Link className="btn" href="/natijalar">Jonli natijalar</Link>
          </div>
        </div>
        <Robot3D />
      </section>

      <section className="section">
        <h2>Robotning vazifalari</h2>
        <p className="sub">Har bir signal ortida quyidagi {TASKS.length} ta ish turadi. Ulardan biri ham bajarilmasa, signal chiqmaydi.</p>
        <div className="tasks">
          {TASKS.map((x) => (
            <div key={x.t} className="task">
              <h3>{x.t}</h3>
              <p>{x.p}</p>
              <span className="kv">{x.k}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <h2>Bitta aylanish: 5 daqiqada nima bo&apos;ladi</h2>
        <ul className="cycle">
          {CYCLE.map((c) => <li key={c.b}><b>{c.b}</b><span>{c.s}</span></li>)}
        </ul>
      </section>

      <section className="section">
        <h2>Robot nimalarni qilmaydi</h2>
        <div className="nots">
          {NOTS.map(([b, s]) => <div key={b}><b>{b}</b> {s}</div>)}
        </div>
        <p className="muted">
          Tavsiya: har savdoda depozitning 1–2% idan ortig&apos;ini xavf ostiga qo&apos;ymang. Robotning haqiqiy natijalarini{" "}
          <Link href="/natijalar">Natijalar</Link> sahifasida tekshiring.
        </p>
      </section>
    </main>
  );
}
