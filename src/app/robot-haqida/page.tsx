import Link from "next/link";
import Robot3D from "../components/Robot3D.tsx";

export const metadata = {
  title: "Robot haqida",
  description: "Zeus roboti oltin (XAU/USD) bozorini qanday kuzatadi, qachon signal beradi va nimalarni qilmaydi.",
};

const TASKS = [
  { t: "Narxlarni yig'ish", p: "Oltinning (XAU/USD) so'nggi narxlarini oladi va ulardan M5, M15, H1, H4 hamda D1 shamlarini quradi. Faqat yopilgan shamlar hisobga olinadi.", k: "har 5 daqiqada · 24/5" },
  { t: "Katta manzarani o'qish", p: "Avval D1, H4 va H1 da bozor qayoqqa ketayotganini, trend kuchli yoki yon harakatda ekanini aniqlaydi. Asosiy yo'nalishga qarshi shoshilmaydi.", k: "D1 · H4 · H1" },
  { t: "Zonalar va darajalar", p: "Talab va taklif zonalarini, yaqin qo'llab-quvvatlash va qarshilik darajalarini, oldingi kun cho'qqi va tublarini belgilaydi. Kirish va maqsadlar shu darajalarga qarab tanlanadi.", k: "zona · daraja" },
  { t: "Kirish nuqtasini kutish", p: "M15 va M5 da narx zonaga qaytib, reaksiya berishini kutadi. Cho'qqida sotib olmaydi, tubda sotmaydi.", k: "M15 · M5" },
  { t: "Risk va maqsadlar", p: "Stop Loss zona ortiga qo'yiladi. Ikkita Take Profit bor: TP1 da savdoning yarmi yopiladi va SL kirishga ko'chadi, qolgan yarmi TP2 gacha boradi. Savdo ko'pi bilan 24 soatda yopiladi.", k: "TP1 / TP2 · SL kirishga" },
  { t: "Yangiliklarni hisobga olish", p: "NFP, CPI, FOMC kabi oltinni keskin silkitadigan AQSh yangiliklari yaqin bo'lsa, buni qarorda hisobga oladi va signal ostida ogohlantirish chiqadi.", k: "NFP · CPI · FOMC" },
  { t: "Har soatda qayta tahlil", p: "Yangi imkoniyatni har soatda izlaydi. Aniq imkoniyat bo'lmasa kutadi: kutish ham qaror.", k: "har soatda" },
  { t: "Ochiq savdoni kuzatish", p: "Ochiq savdo har soatda qayta ko'riladi: bozor o'zgarsa SL yaqinlashtiriladi (hech qachon uzoqlashtirilmaydi) yoki savdo erta yopiladi.", k: "SL faqat yaqinlashadi" },
  { t: "Natijani ochiq yozish", p: "Har bir signal bazaga yoziladi va yopilguncha kuzatiladi: TP1, TP2, SL yoki muddat bo'yicha yopilish. Natija avtomatik hisoblanadi va Natijalar sahifasida tanlab olinmasdan ko'rsatiladi.", k: "hammasi ochiq" },
  { t: "Demo hisobda o'zini sinash", p: "Tizim o'z signallari bo'yicha virtual hisobda o'zi savdo qiladi. Bu haqiqiy pul emas, lekin strategiya amalda qanday ishlashini ko'rsatadi.", k: "virtual hisob" },
  { t: "Signalni yetkazish", p: "Signal chiqqanda u obunachilarning kabinetida darhol ko'rinadi: kirish narxi, TP1, TP2, SL va sababi bilan. Savollar bo'lsa, AI operator javob beradi.", k: "kabinet · AI operator" },
];

const CYCLE = [
  { b: "1. Narx keldi", s: "Yangi shamlar yopildi, tizim uyg'ondi." },
  { b: "2. Katta manzara", s: "D1, H4, H1 trendi va bozor holati o'qiladi." },
  { b: "3. Zonalar", s: "Talab va taklif zonalari, darajalar, yaqin yangiliklar tekshiriladi." },
  { b: "4. Qaror", s: "Aniq imkoniyat bo'lsa BUY yoki SELL, kirish, SL va ikki TP belgilanadi; bo'lmasa kutadi." },
  { b: "5. Kuzatuv", s: "Ochiq signal TP yoki SL ga yetguncha har 5 daqiqada tekshiriladi, har soatda qayta ko'riladi." },
  { b: "6. Saboq", s: "Natija bazaga yoziladi va keyingi tahlillarda o'tgan savdolar hisobga olinadi." },
];

const NOTS = [
  ["Kafolat bermaydi.", "Hech bir robot har doim yutmaydi. Shuning uchun har signalda Stop Loss bor."],
  ["Pulingizga tegmaydi.", "Robot brokeringizga ulanmaydi, savdoni siz o'zingiz ochasiz."],
  ["Shoshilmaydi.", "Narx zonaga qaytmaguncha \"arzon\" yoki \"qimmat\" deb kirmaydi."],
  ["Signalni majburan chiqarmaydi.", "Shartlar mos kelmasa, bir necha soat yoki kun signal bo'lmasligi mumkin."],
];

export default function AboutRobot() {
  return (
    <main>
      <section className="about-hero">
        <div>
          <span className="eyebrow">Robot haqida</span>
          <h1>Zeus: oltin bozorini <em>sizning o&apos;rningizga</em> kuzatuvchi robot</h1>
          <p className="lead" style={{ color: "var(--muted)", fontSize: "1.06rem", maxWidth: "58ch", margin: "16px 0 22px" }}>
            Zeus oltin (XAU/USD) narxini kechayu kunduz kuzatadigan dastur. U his-tuyg&apos;uga berilmaydi, charchamaydi: bozorni har soatda bir nechta taymfreymda tahlil qiladi va faqat
            aniq imkoniyat ko&apos;rganda signal beradi.
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
        <p className="sub">Har bir signal ortida quyidagi {TASKS.length} ta ish turadi.</p>
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
        <h2>Bitta aylanish: nima bo&apos;ladi</h2>
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
