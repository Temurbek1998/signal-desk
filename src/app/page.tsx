import Link from "next/link";
import { formatUsdt, listPlans } from "@/lib/server/billing.ts";
import { PAID_TIERS, TIER_NAME } from "@/lib/memory.ts";

const CHAT_LIMIT = { standard: 30, pro: 45, vip: 60 } as const;
import { trackRecord } from "@/lib/server/track.ts";
import { activeCategories } from "@/lib/instruments.ts";

export const dynamic = "force-dynamic";

const MIN_LIVE = 20; // shuncha yopilgan signal bo'lgach jonli statistika ko'rsatiladi

export default async function Home() {
  const [plans, record] = await Promise.all([listPlans().catch(() => []), trackRecord(90).catch(() => [])]);
  const all = record.find((r) => r.timeframe === "ALL");
  const live = all && all.closed >= MIN_LIVE;
  const cats = activeCategories();
  const goldOnly = cats.length === 1 && cats[0] === "gold";
  const marketLine = goldOnly ? "XAU/USD, M15" : `${cats.map((c) => ({ gold: "Oltin", forex: "Valyuta", crypto: "Kripto" })[c]).join(", ")}, M15 va M30`;

  return (
    <main>
      <section className="hero">
        <div>
          <span className="eyebrow">{goldOnly ? "XAU/USD · Oltin" : "XAU/USD · Forex · Kripto"}</span>
          <h1>
            Bozorni robot kuzatadi. <em>Siz faqat qaror qilasiz.</em>
          </h1>
          <p className="lead">
            {goldOnly
              ? "Signal Desk oltinni (XAU/USD) 24 soat kuzatadi, M15 taymfreymida va faqat barcha shartlar mos kelganda aniq kirish, Take Profit hamda Stop Loss darajalari bilan signal beradi. NFP, CPI va FOMC kabi oltinni silkitadigan yangiliklardan oldin ogohlantiradi."
              : "Signal Desk oltin, valyuta va kripto juftliklarini M15 va M30 taymfreymlarida uzluksiz tahlil qiladi va aniq kirish, Take Profit hamda Stop Loss darajalari bilan signal beradi. Muhim iqtisodiy yangiliklardan oldin ogohlantiradi."}
          </p>
          <div className="cta">
            <Link className="btn gold" href="/royxat">Obuna bo'lish</Link>
            <Link className="btn" href="/natijalar">Natijalarni ko'rish</Link>
          </div>
        </div>

        <div className="hero-card" aria-label="Namuna signal">
          <div className="top">
            <div>
              <div className="pair">XAU/USD</div>
              <div className="cat">Oltin · M30 · namuna</div>
            </div>
            <span className="side buy">BUY</span>
          </div>
          <div className="levels">
            <span className="k">KIRISH</span><span>2 664.20</span><span className="d" />
            <span className="k">TP 1</span><span className="up">2 668.70</span><span className="d">45 pip</span>
            <span className="k">TP 2</span><span className="up">2 677.70</span><span className="d">135 pip</span>
            <span className="k">SL</span><span className="down">2 655.20</span><span className="d">90 pip</span>
          </div>
          <ul className="reasons">
            <li>EMA20 &gt; EMA50, trend yuqoriga</li>
            <li>ADX 27: trend kuchli</li>
            <li>H1 trendi tasdiqlaydi, pullback tugadi</li>
          </ul>
          <p className="newsflag">Yangilik xavfi: USD Non-Farm Payrolls 40 daqiqadan keyin</p>
        </div>
      </section>

      <section className="section">
        <h2>{live ? "So'nggi 90 kunlik natija" : "Tarixiy sinov natijasi"}</h2>
        <p className="sub">
          {live
            ? "Robot bergan har bir signal bazaga yoziladi va natijasi avtomatik hisoblanadi. Hech narsa tanlab olinmaydi."
            : goldOnly
              ? "Oltin uchun robot 2026-yil iyun–oktabr narxlarida (123 kun) sinovdan o'tkazilgan: M15 da 38 ta signal, 87% i foyda bilan yopilgan. Bu kichik namuna, jonli natija har doim muhimroq; jonli natijalar shu yerda ko'rinadi."
              : "Robot 10 ta kripto juftligining 2018-yil yanvar narxlarida sinovdan o'tkazilgan (M15 va M30). Bu kichik sinov, jonli natija har doim muhimroq. Jonli natijalar yig'ilgach shu yerda ko'rinadi."}
        </p>
        <div className="stats">
          {live ? (
            <>
              <div className="stat"><b>{Math.round(all.winRate * 100)}%</b><span>Win rate (TP1 gacha)</span></div>
              <div className="stat"><b>{all.profitFactor?.toFixed(2) ?? "—"}</b><span>Profit factor</span></div>
              <div className="stat"><b>{all.closed}</b><span>Yopilgan signallar</span></div>
              <div className="stat"><b>{all.totalR >= 0 ? "+" : ""}{all.totalR.toFixed(1)}R</b><span>Jami natija, risk birligida</span></div>
            </>
          ) : (
            <>
              <div className="stat"><b>72%</b><span>M15 win rate</span></div>
              <div className="stat"><b>73%</b><span>M30 win rate</span></div>
              <div className="stat"><b>1.16–1.20</b><span>Profit factor</span></div>
              <div className="stat"><b>215</b><span>Sinov savdolari{goldOnly ? " (kripto)" : ""}</span></div>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><Link className="btn" href="/natijalar">Batafsil statistika</Link></div>
      </section>

      <section className="section">
        <h2>Ikki robot</h2>
        <div className="steps">
          <div className="step"><h3>Zeus</h3><p>Asosiy robot. Trend ichidagi aniq kirishlar (M15) va 300–400 pips maqsadli rejim: pullback va London ochilishidagi yorib o'tish.</p></div>
          <div className="step"><h3>Gerakl</h3><p>Skalping va razgon roboti (M5). Oltin keskin impuls bilan harakatlanganda qisqa savdo: TP 150, SL 80 pips, 2 soat ichida yopiladi. Hozir sinov bosqichida, demo hisobda ishlaydi.</p></div>
        </div>
      </section>

      <section className="section">
        <h2>Zeus qanday tahlil qiladi</h2>
        <div className="steps">
          <div className="step"><h3>Trend</h3><p>EMA20 va EMA50 orqali bozor yo'nalishini aniqlaydi. Trendga qarshi signal berilmaydi.</p></div>
          <div className="step"><h3>Trend kuchi</h3><p>ADX 20 dan past bo'lsa, bozor yon harakatda deb hisoblanadi va signal berilmaydi.</p></div>
          <div className="step"><h3>Yuqori taymfreym</h3><p>M15 signali H1 trendi bilan tasdiqlanishi shart.</p></div>
          <div className="step"><h3>Kirish nuqtasi</h3><p>Trend ichidagi qaytish (pullback) tugaganini RSI orqali kutadi, cho'qqida sotib olmaydi.</p></div>
          <div className="step"><h3>Risk</h3><p>Stop Loss bozor tebranishiga (ATR) qarab qo'yiladi, TP1 dan keyin SL kirish nuqtasiga ko'chiriladi.</p></div>
          <div className="step"><h3>Yangiliklar</h3><p>NFP, CPI, FOMC kabi yangiliklardan oldin tegishli juftliklarda ogohlantirish chiqadi.</p></div>
        </div>
      </section>

      <section className="section" id="narxlar">
        <h2>Tariflar</h2>
        <p className="sub">
          Zeus trend rejimida faqat barcha shartlar mos kelganda signal beradi, pips rejimi bilan birga oltinda kuniga
          o'rtacha 1–2 ta signal chiqadi, ba'zi kunlari umuman chiqmaydi. Mijozlarga kuniga 2 tagacha signal beriladi. Standart tarifda eng yuqori reytingli (A) signallar, PRO va VIP tariflarda
          A va B reytingli signallar ochiq.
          Signal reytingini robot o'z xotirasidan, ya'ni o'xshash signallarning o'tgan natijalaridan hisoblaydi.
        </p>
        {PAID_TIERS.map((tier) => (
          <div key={tier} className="plan-group">
            <h3>{TIER_NAME[tier]}</h3>
            <div className="plans">
              {plans.filter((p) => p.tier === tier).map((p) => {
                const base = plans.find((x) => x.tier === tier && x.days === 30);
                const best = p.days === 90;
                return (
                  <div key={p.id} className={`plan ${best ? "best" : ""} ${tier}`}>
                    <h3>{p.name}</h3>
                    <div className="price">{formatUsdt(p.price_usdt)}</div>
                    <div className="per">
                      {base && p.days > 30
                        ? `oyiga ${formatUsdt(Math.round((p.price_usdt / p.days) * 300) / 10)}, ${Math.round((1 - p.price_usdt / ((base.price_usdt / 30) * p.days)) * 100)}% tejash`
                        : `${p.days} kun`}
                    </div>
                    <ul>
                      <li>{tier === "standard" ? "Eng kuchli signallar (A reyting)" : "A va B reytingli barcha kuchli signallar"}</li>
                      {tier === "vip" && <li>Ustuvor yordam</li>}
                      <li>{marketLine}</li>
                      <li>Yangiliklar ogohlantirishi</li>
                      <li>AI operator: kuniga {CHAT_LIMIT[tier]} savol</li>
                    </ul>
                    <Link className={`btn ${best ? "gold" : ""}`} href="/royxat">Tanlash</Link>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="section">
        <h2>Ko'p beriladigan savollar</h2>
        <div className="faq">
          <details>
            <summary>Signallar 100% to'g'ri chiqadimi?</summary>
            <p>Yo'q. Hech bir robot yoki treyder har doim yutmaydi. Shuning uchun har signalda Stop Loss bor va natijalarimizni ochiq ko'rsatamiz. Har bir savdoda depozitning 1–2% idan ortig'ini xavf ostiga qo'ymang.</p>
          </details>
          <details>
            <summary>Signallar qayerdan keladi?</summary>
            <p>{goldOnly ? "Signallarni robot avtomatik hisoblaydi: spot oltin (XAU/USD) kotirovkalari asosida, har bir yopilgan shamda." : "Signallarni robot avtomatik hisoblaydi: forex/oltin kotirovkalari va Binance narxlari (kripto) asosida, har bir yopilgan shamda."}</p>
          </details>
          <details>
            <summary>Signal qanchalik tez-tez chiqadi?</summary>
            <p>Robot har daqiqada signal tashlamaydi. U bozorni doim kuzatadi, lekin faqat barcha shartlar bir vaqtda mos kelganda "kuchli signal" beradi. Ba'zan bir necha soat signal bo'lmasligi odatiy holat: bu sifat uchun.</p>
          </details>
          <details>
            <summary>Qaysi taymfreym eng ishonchli?</summary>
            <p>Tarixiy sinovda M15 va M30 eng yaxshi natija bergan. M5 signallari shovqinliroq, ularga ehtiyot bo'lish kerak.</p>
          </details>
          <details>
            <summary>Qanday to'layman?</summary>
            <p>To'lov USDT'da (TRC20 va boshqa tarmoqlar). Kabinetda ko'rsatilgan hamyonga o'tkazing, tranzaksiya ID sini kiriting va "To'lov qildim" tugmasini bosing. Admin tekshirib tasdiqlagach obuna yoqiladi.</p>
          </details>
        </div>
      </section>
    </main>
  );
}
