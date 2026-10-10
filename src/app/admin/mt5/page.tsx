import { randomBytes } from "node:crypto";
import { requireAdmin } from "@/lib/server/auth.ts";
import { sql } from "@/lib/server/db.ts";
import LocalTime from "../../components/LocalTime.tsx";

export const metadata = { title: "MT5 avtosavdo", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const SITE = "https://signal-desk-vert.vercel.app";

// MT5 Expert Advisor: Claude tasdiqlagan oltin signallarini egasining MT5 hisobida avtomatik ochadi.
export default async function Mt5Page() {
  await requireAdmin();
  const keySet = (process.env.EA_KEY ?? "").length >= 16;
  const [ping] = await sql<{ last_seen: Date; info: string }>("SELECT last_seen, info FROM ea_pings WHERE id = 1").catch(() => []);
  const online = ping && Date.now() - new Date(ping.last_seen).getTime() < 3 * 60_000;
  const suggestion = randomBytes(18).toString("base64url");
  return (
    <main className="wrap">
      <header className="page-head">
        <div>
          <h1>MT5 avtosavdo</h1>
          <p className="sub">Claude tasdiqlagan oltin signallari MT5 hisobingizda avtomatik ochiladi va boshqariladi. Login va parol saytga berilmaydi: dastur sizning MT5&apos;ingizda ishlaydi.</p>
        </div>
      </header>

      <section className="panel">
        <h2>Holat</h2>
        <div className="stats">
          <div className="stat"><b className={keySet ? "up" : "down"}>{keySet ? "Sozlangan" : "Yo'q"}</b><span>EA_KEY (Vercel)</span></div>
          <div className="stat">
            <b className={online ? "up" : "down"}>{online ? "Ulangan" : ping ? "Uzilgan" : "Hali ulanmagan"}</b>
            <span>{ping ? <>Oxirgi so&apos;rov <LocalTime at={ping.last_seen} />{ping.info ? ` · ${ping.info}` : ""}</> : "MT5 dasturi hali saytga murojaat qilmagan"}</span>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>O&apos;rnatish (bir marta, ~10 daqiqa)</h2>
        <ol className="an-list" style={{ display: "grid", gap: 10 }}>
          <li>
            <b>Kalit yarating.</b> Vercel → Settings → Environment Variables → <code>EA_KEY</code> (Secret). Qiymat sifatida masalan shuni nusxalang:
            <br /><code className="mono" style={{ userSelect: "all" }}>{suggestion}</code>
            <br />Save, keyin Redeploy. Bu kalitni chatga yozmang.
          </li>
          <li><b>Dasturni yuklab oling:</b> <a href="/mt5/SignalDeskEA.mq5" download>SignalDeskEA.mq5</a></li>
          <li>MT5 da: <b>Fayl → Ma&apos;lumotlar papkasini ochish</b> → <code>MQL5\Experts</code> papkasiga faylni qo&apos;ying. MetaEditor&apos;da (F4) oching va <b>Compile</b> (F7) bosing.</li>
          <li><b>Servis → Sozlamalar → Expert Advisors</b>: &quot;Algo savdoga ruxsat&quot; va &quot;WebRequest uchun ruxsat etilgan URL&quot; ni belgilang, ro&apos;yxatga <code>{SITE}</code> qo&apos;shing.</li>
          <li>Oltin grafigini oching (Exness: <code>XAUUSDm</code>, XM: <code>GOLD</code>), Navigator&apos;dan <b>SignalDeskEA</b> ni grafikka torting. <b>InpKey</b> ga Vercel&apos;dagi EA_KEY ni yozing, OK. Yuqoridagi <b>Algo Trading</b> tugmasi yashil bo&apos;lsin.</li>
          <li>Bir daqiqada yuqoridagi holat &quot;Ulangan&quot; bo&apos;ladi.</li>
        </ol>
      </section>

      <section className="panel">
        <h2>Dastur qanday savdo qiladi</h2>
        <ul className="an-list">
          <li>Har 10 soniyada saytdan Claude tasdiqlagan Zeus signallari va Claude&apos;ning o&apos;z savdolarini oladi (<code>InpSource</code>: zeus, claude yoki both).</li>
          <li>Risk: har savdoda balansning <b>1%</b> i (<code>InpRiskPct</code>). Lot avtomatik hisoblanadi.</li>
          <li>Ikkita pozitsiya ochadi: yarmi TP1 da yopiladi, qolgani TP2 gacha. TP1 dan keyin Zeus savdosida SL narx ortidan suriladi, Claude savdosida kirishga ko&apos;chadi.</li>
          <li>Zeus savdosi 8 soatda, Claude savdosi 24 soatda yopiladi. Signal 20 daqiqadan eski bo&apos;lsa yoki narx uzoqlashgan bo&apos;lsa ochilmaydi.</li>
          <li><b>Faqat demo hisobda ishlaydi.</b> Haqiqiy hisob uchun <code>InpAllowReal</code> ni qo&apos;lda yoqish kerak: buni demo natijasi kamida 2–4 hafta foyda ko&apos;rsatgandan keyin qiling.</li>
          <li>MT5 ochiq turishi kerak (kompyuter yoki VPS). Kompyuter o&apos;chsa, ochiq savdolar SL/TP bilan brokerda qoladi, lekin SL surilmaydi.</li>
        </ul>
      </section>
    </main>
  );
}
