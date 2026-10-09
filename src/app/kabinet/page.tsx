import Link from "next/link";
import PaymentForm from "../components/PaymentForm.tsx";
import { requireUser } from "@/lib/server/auth.ts";
import { formatUsdt, listPlans, networks } from "@/lib/server/billing.ts";
import { sql } from "@/lib/server/db.ts";
import { TIER_NAME } from "@/lib/memory.ts";

export const metadata = { title: "Kabinet" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { pending: "Tekshirilmoqda", paid: "Tasdiqlandi", rejected: "Rad etildi" };

export default async function CabinetPage() {
  const { user, activeUntil, tier } = await requireUser();
  const plans = await listPlans();
  const payments = await sql<{ id: string; plan: string; amount_usdt: string | null; network: string | null; status: string; created_at: Date }>(
    `SELECT p.id, pl.name AS plan, p.amount_usdt, p.network, p.status, p.created_at FROM payments p JOIN plans pl ON pl.id = p.plan_id
     WHERE p.user_id = $1 ORDER BY p.created_at DESC LIMIT 10`,
    [user.id],
  );
  const pending = payments.some((p) => p.status === "pending");
  const nets = networks().map(({ id, label, address }) => ({ id, label, address }));

  return (
    <main className="wrap">
      <header className="page-head">
        <div>
          <h1>Kabinet</h1>
          <p className="sub">{user.name || user.email}</p>
        </div>
      </header>

      <section className="panel">
        <h2>Obuna</h2>
        {user.role === "admin" ? (
          <p>Siz adminsiz, signallar doim ochiq.</p>
        ) : activeUntil ? (
          <p>
            {TIER_NAME[tier ?? "standard"]} obuna faol: <b className="mono">{activeUntil.toLocaleDateString("ru-RU")}</b> gacha.
            {tier === "standard" ? " Sizga eng kuchli (A reytingli) signallar ochiq. PRO va VIP tariflarda B reytingli signallar ham bor." : " Sizga A va B reytingli barcha kuchli signallar ochiq."}
          </p>
        ) : (
          <p>Faol obuna yo'q. Signallarni ko'rish uchun quyidagi tariflardan birini tanlang.</p>
        )}
        {(activeUntil || user.role === "admin") && (
          <div>
            <Link className="btn gold" href="/signallar">Signallarga o'tish</Link>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>{activeUntil ? "Obunani uzaytirish" : "Obuna sotib olish"}</h2>
        <p className="muted">
          To'lov faqat USDT'da qabul qilinadi. Tarif va tarmoqni tanlang, ko'rsatilgan summani hamyonga o'tkazing,
          so'ng tranzaksiya ID sini kiritib "To'lov qildim" tugmasini bosing. Admin hamyonni tekshirib tasdiqlagach obuna yoqiladi.
        </p>
        {pending ? (
          <p className="notice">To'lovingiz tekshirilmoqda. Admin tasdiqlagach obuna shu yerda yoqiladi.</p>
        ) : (
          <PaymentForm plans={plans.map((p) => ({ id: p.id, name: p.name, price: formatUsdt(p.price_usdt) }))} networks={nets} disabled={false} />
        )}
      </section>

      {payments.length > 0 && (
        <section className="panel">
          <h2>To'lovlar tarixi</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Sana</th><th>Tarif</th><th className="num">Summa</th><th>Holat</th></tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.created_at).toLocaleString("ru-RU")}</td>
                    <td>{p.plan}</td>
                    <td className="num">{p.amount_usdt ? formatUsdt(p.amount_usdt) : "—"}{p.network ? ` · ${p.network}` : ""}</td>
                    <td>{STATUS[p.status]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </main>
  );
}
