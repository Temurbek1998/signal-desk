import { closeTicket } from "@/app/actions.ts";
import { requireAdmin } from "@/lib/server/auth.ts";
import { sql } from "@/lib/server/db.ts";
import { operatorProvider } from "@/lib/server/llm.ts";
import LocalTime from "../../components/LocalTime.tsx";

export const metadata = { title: "Operator", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Ticket = { id: number; created_at: Date; contact: string; message: string; chat: string; status: string; closed_at: Date | null; email: string | null };
type Row = { id: number; created_at: Date; question: string; answer: string; client_key: string; email: string | null };

// Sayt operatori (chat) bilan yozishmalar: mijozlar nima so'rayapti va operator nima javob beryapti.
export default async function OperatorPage() {
  await requireAdmin();
  const [[stats], rows, tickets] = await Promise.all([
    sql<{ day: string; week: string; people: string; guests: string }>(
      `SELECT count(*) FILTER (WHERE created_at > now() - interval '1 day') AS day,
              count(*) AS week,
              count(DISTINCT client_key) AS people,
              count(DISTINCT client_key) FILTER (WHERE user_id IS NULL) AS guests
       FROM chat_log WHERE created_at > now() - interval '7 days'`,
    ),
    sql<Row>(
      `SELECT c.id, c.created_at, c.question, c.answer, c.client_key, u.email
       FROM chat_log c LEFT JOIN users u ON u.id = c.user_id
       ORDER BY c.created_at DESC LIMIT 60`,
    ),
    sql<Ticket>(
      `SELECT t.id, t.created_at, t.contact, t.message, t.chat, t.status, t.closed_at, u.email
       FROM tickets t LEFT JOIN users u ON u.id = t.user_id
       ORDER BY (t.status = 'open') DESC, t.created_at DESC LIMIT 40`,
    ),
  ]);
  const open = tickets.filter((t) => t.status === "open").length;
  const p = operatorProvider();
  return (
    <main className="wrap">
      <header className="page-head">
        <div>
          <h1>Operator</h1>
          <p className="sub">Har sahifadagi chat. Operator (DeepSeek yoki Gemini) faqat platforma haqidagi savollarga javob beradi: ro&apos;yxatdan o&apos;tish, tariflar, to&apos;lov, obuna. Signal va bozor haqida gapirmaydi. Muammo bo&apos;lsa mijoz &quot;Adminga murojaat&quot; tugmasi bilan murojaat ochadi.</p>
        </div>
      </header>
      <section className="panel">
        <div className="stats">
          <div className="stat"><b className={p ? "up" : "down"}>{p ? "Ulangan" : "Ulanmagan"}</b><span>{p ? `Provayder: ${p}` : "DEEPSEEK_API_KEY yoki GEMINI_API_KEY yo'q"}</span></div>
          <div className="stat"><b className={open ? "down" : undefined}>{open}</b><span>ochiq murojaat</span></div>
          <div className="stat"><b>{stats?.day ?? 0}</b><span>savol, 24 soat</span></div>
          <div className="stat"><b>{stats?.week ?? 0}</b><span>savol, 7 kun</span></div>
          <div className="stat"><b>{stats?.people ?? 0}</b><span>kishi, 7 kun ({stats?.guests ?? 0} mehmon)</span></div>
        </div>
      </section>
      <section className="panel">
        <h2>Murojaatlar</h2>
        {!tickets.length && <p className="muted">Hali murojaat yo&apos;q.</p>}
        <div style={{ display: "grid", gap: 14 }}>
          {tickets.map((t) => (
            <article key={t.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, opacity: t.status === "open" ? 1 : 0.6 }}>
              <p className="muted" style={{ margin: 0 }}>
                #{t.id} · <LocalTime at={t.created_at} /> · {t.email ?? "mehmon"}{t.contact ? ` · ${t.contact}` : ""} · {t.status === "open" ? <b className="down">ochiq</b> : "yopilgan"}
              </p>
              <p style={{ margin: "6px 0", fontWeight: 600, whiteSpace: "pre-wrap" }}>{t.message}</p>
              {t.chat && <details><summary className="muted">Chat tarixi</summary><p className="ai-box" style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{t.chat}</p></details>}
              {t.status === "open" && (
                <form action={closeTicket} style={{ marginTop: 8 }}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="btn sm">Hal qilindi, yopish</button>
                </form>
              )}
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Oxirgi yozishmalar</h2>
        {!rows.length && <p className="muted">Hali hech kim yozmagan.</p>}
        <div style={{ display: "grid", gap: 14 }}>
          {rows.map((r) => (
            <article key={r.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
              <p className="muted" style={{ margin: 0 }}><LocalTime at={r.created_at} /> · {r.email ?? "mehmon"}</p>
              <p style={{ margin: "6px 0", fontWeight: 600, whiteSpace: "pre-wrap" }}>{r.question}</p>
              <p className="ai-box" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{r.answer}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
