import "server-only";

// Email yuborish. MAIL_PROVIDER: resend | brevo | smtp | console.
// console — faqat lokal sinov uchun: xat server jurnaliga yoziladi.
export type Mail = { to: string; subject: string; text: string; html: string };

export class MailNotConfigured extends Error {}

function provider(): string {
  const p = process.env.MAIL_PROVIDER?.trim().toLowerCase();
  if (p) return p;
  if (process.env.RESEND_API_KEY) return "resend";
  if (process.env.BREVO_API_KEY) return "brevo";
  if (process.env.SMTP_HOST) return "smtp";
  return process.env.NODE_ENV === "production" ? "" : "console";
}

const from = () => process.env.MAIL_FROM || "Signal Desk <noreply@example.com>";

function parseFrom(f: string): { name: string; email: string } {
  const m = f.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].replace(/^"|"$/g, ""), email: m[2] } : { name: "", email: f.trim() };
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

export async function sendMail(m: Mail): Promise<void> {
  switch (provider()) {
    case "resend":
      return post("https://api.resend.com/emails", { authorization: `Bearer ${process.env.RESEND_API_KEY}` }, {
        from: from(), to: [m.to], subject: m.subject, text: m.text, html: m.html,
      });
    case "brevo":
      return post("https://api.brevo.com/v3/smtp/email", { "api-key": process.env.BREVO_API_KEY ?? "" }, {
        sender: parseFrom(from()), to: [{ email: m.to }], subject: m.subject, textContent: m.text, htmlContent: m.html,
      });
    case "smtp": {
      const { createTransport } = await import("nodemailer");
      const port = Number(process.env.SMTP_PORT || 587);
      const t = createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,
        auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
      });
      await t.sendMail({ from: from(), to: m.to, subject: m.subject, text: m.text, html: m.html });
      return;
    }
    case "console":
      console.log(`[mail] ${m.to} | ${m.subject}\n${m.text}`);
      return;
    default:
      throw new MailNotConfigured("Email yuborish sozlanmagan (MAIL_PROVIDER).");
  }
}
