import Link from "next/link";
import { adminHref } from "@/lib/adminPath.ts";
import { approvePayment, rejectPayment } from "../actions.ts";
import GrantForm from "../components/GrantForm.tsx";
import { requireAdmin } from "@/lib/server/auth.ts";
import { explorerUrl, formatUsdt, networks } from "@/lib/server/billing.ts";
import { sql } from "@/lib/server/db.ts";
import { TIER_NAME, type PaidTier } from "@/lib/memory.ts";

export const metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireAdmin();
  const [pending, users, [totals], log] = await Promise.all([
    sql<{ id: string; email: string; plan: string; amount_usdt: string | null; network: string | null; tx_hash: string | null; note: string; created_at: Date }>(
      `SELECT p.id, u.email, pl.name AS plan, p.amount_usdt, p.network, p.tx_hash, p.note, p.created_at
       FROM payments p JOIN users u ON u.id = p.user_id JOIN plans pl ON pl.id = p.plan_id
       WHERE p.status = 'pending' ORDER BY p.created_at`,
    ),
    sql<{ email: string; name: string; role: string; created_at: Date; ends_at: Date | null; tier: string | null }>(
      `SELECT u.email, u.name, u.role, u.created_at,
              (SELECT max(ends_at) FROM subscriptions s WHERE s.user_id = u.id AND s.ends_at > now()) AS ends_at,
              (SELECT s.tier FROM subscriptions s WHERE s.user_id = u.id AND s.starts_at <= now() AND s.ends_at > now()
               ORDER BY CASE s.tier WHEN 'vip' THEN 3 WHEN 'pro' THEN 2 ELSE 1 END DESC LIMIT 1) AS tier
       FROM users u ORDER BY u.created_at DESC LIMIT 200`,
    ),
    sql<{ users: string; active: string; revenue: string | null }>(
      `SELECT (SELECT count(*) FROM users) AS users,
              (SELECT count(DISTINCT user_id) FROM subscriptions WHERE starts_at <= now() AND ends_at > now()) AS active,
              (SELECT sum(amount_usdt) FROM payments WHERE status = 'paid' AND decided_at > now() - interval '30 days') AS revenue`,
    ),
    sql<{ id: number; at: Date; email: string; action: string; target: string | null; details: string }>(
      "SELECT id, at, email, action, target, details FROM admin_log ORDER BY at DESC LIMIT 50",
    ),
  ]);

  return (
    <main className="wrap">
      <header className="page-head">
        <div>
          <h1>Admin panel</h1>
          <p className="sub">To'lovlar, obunalar va foydalanuvchilar</p>
        </div>
        <Link className="btn gold sm" href={adminHref("/robot")}>Robot jurnali</Link>
        <Link className="btn gold sm" href={adminHref("/demo")}>Demo hisob</Link>
        <Link className="btn gold sm" href={adminHref("/sinov")}>Bozorlar sinovi</Link>
      </header>

      <div className="stats">
        <div className="stat"><b>{totals.users}</b><span>Foydalanuvchilar</span></div>
        <div className="stat"><b>{totals.active}</b><span>Faol obunalar</span></div>
        <div className="stat"><b>{formatUsdt(Number(totals.revenue ?? 0))}</b><span>Daromad, 30 kun</span></div>
      </div>

      <section className="panel">
        <h2>Tekshirilishi kerak bo'lgan to'lovlar</h2>
        <p className="muted">
          Tranzaksiya havolasini oching va tekshiring: tanga USDT, summa to'liq, qabul qiluvchi sizning hamyoningiz
          {networks().length > 0 && <> ({networks().map((n) => `${n.id}: ${n.address.slice(0, 6)}…${n.address.slice(-4)}`).join(", ")})</>}, holati "Success". Shundan keyin tasdiqlang.
        </p>
        {pending.length === 0 ? (
          <p className="muted">Hozir yangi to'lov so'rovi yo'q.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Sana</th><th>Email</th><th>Tarif</th><th className="num">Summa</th><th>Tranzaksiya</th><th>Izoh</th><th /></tr>
              </thead>
              <tbody>
                {pending.map((p) => (
                  <tr key={p.id}>
                    <td>{new Date(p.created_at).toLocaleString("ru-RU")}</td>
                    <td>{p.email}</td>
                    <td>{p.plan}</td>
                    <td className="num">{p.amount_usdt ? formatUsdt(p.amount_usdt) : "—"}</td>
                    <td className="tx">
                      {p.network && <b>{p.network} </b>}
                      {explorerUrl(p.network, p.tx_hash) ? (
                        <a href={explorerUrl(p.network, p.tx_hash)!} target="_blank" rel="noreferrer" className="mono">{p.tx_hash}</a>
                      ) : (
                        <span className="mono">{p.tx_hash ?? "—"}</span>
                      )}
                    </td>
                    <td>{p.note}</td>
                    <td style={{ display: "flex", gap: 6 }}>
                      <form action={approvePayment}><input type="hidden" name="id" value={p.id} /><button className="btn gold sm">Tasdiqlash</button></form>
                      <form action={rejectPayment}><input type="hidden" name="id" value={p.id} /><button className="btn sm">Rad etish</button></form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Admin harakatlari jurnali</h2>
        {log.length === 0 ? (
          <p className="muted">Hali yozuv yo'q.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vaqt</th><th>Admin</th><th>Harakat</th><th>Kimga</th><th>Tafsilot</th></tr></thead>
              <tbody>
                {log.map((l) => (
                  <tr key={l.id}>
                    <td>{new Date(l.at).toLocaleString("ru-RU", { timeZone: "Asia/Tashkent" })}</td>
                    <td>{l.email}</td>
                    <td>{l.action}</td>
                    <td>{l.target ?? "—"}</td>
                    <td className="muted">{l.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Qo'lda obuna berish</h2>
        <GrantForm />
      </section>

      <section className="panel">
        <h2>Foydalanuvchilar</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Email</th><th>Ism</th><th>Ro'yxatdan o'tgan</th><th>Obuna</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.email}>
                  <td>{u.email}{u.role === "admin" ? " (admin)" : ""}</td>
                  <td>{u.name}</td>
                  <td>{new Date(u.created_at).toLocaleDateString("ru-RU")}</td>
                  <td>{u.ends_at ? `${TIER_NAME[(u.tier ?? "standard") as PaidTier] ?? "Standart"}, ${new Date(u.ends_at).toLocaleDateString("ru-RU")} gacha` : "yo'q"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
