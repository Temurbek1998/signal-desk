import "server-only";
import { createHash, randomInt } from "node:crypto";
import { sql } from "./db.ts";
import { sendMail } from "./mail.ts";

export const CODE_TTL_MIN = 10;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_SEC = 60;
export const MAX_SENDS_PER_HOUR = 5;

const hash = (userId: string, code: string) => createHash("sha256").update(`${userId}:${code}`).digest("hex");

export type SendResult = { ok: true } | { ok: false; error: string; cooldown?: boolean };

// Yangi 6 xonali kod yaratib emailga yuboradi. Eski kodlar bekor bo'ladi.
export async function sendCode(user: { id: string; email: string; name: string }): Promise<SendResult> {
  const [recent] = await sql<{ n: number; last: Date | null }>(
    `SELECT count(*)::int AS n, max(created_at) AS last FROM email_codes
     WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
    [user.id],
  );
  if (recent.last && Date.now() - new Date(recent.last).getTime() < RESEND_COOLDOWN_SEC * 1000) {
    return { ok: false, cooldown: true, error: `Yangi kodni ${RESEND_COOLDOWN_SEC} soniyadan keyin so'rashingiz mumkin.` };
  }
  if (recent.n >= MAX_SENDS_PER_HOUR) {
    return { ok: false, error: "Kod juda ko'p so'raldi. Bir soatdan keyin urinib ko'ring." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await sql("UPDATE email_codes SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [user.id]);
  await sql(
    `INSERT INTO email_codes (user_id, code_hash, expires_at) VALUES ($1, $2, now() + make_interval(mins => $3))`,
    [user.id, hash(user.id, code), CODE_TTL_MIN],
  );
  const hello = user.name ? `Salom, ${user.name}!` : "Salom!";
  try {
    await sendMail({
      to: user.email,
      subject: `Zeus Number One tasdiqlash kodi: ${code}`,
      text: `${hello}\n\nTasdiqlash kodingiz: ${code}\nKod ${CODE_TTL_MIN} daqiqa amal qiladi.\n\nAgar siz ro'yxatdan o'tmagan bo'lsangiz, bu xatni e'tiborsiz qoldiring.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px">
<h2 style="margin:0 0 12px;color:#0b1730">Zeus Number One</h2>
<p>${escapeHtml(hello)}</p><p>Tasdiqlash kodingiz:</p>
<p style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#b8862b;margin:8px 0">${code}</p>
<p style="color:#6b7280">Kod ${CODE_TTL_MIN} daqiqa amal qiladi. Agar siz ro'yxatdan o'tmagan bo'lsangiz, bu xatni e'tiborsiz qoldiring.</p></div>`,
    });
  } catch (e) {
    console.error("[mail]", e);
    await sql("DELETE FROM email_codes WHERE user_id = $1 AND used_at IS NULL", [user.id]);
    return { ok: false, error: "Emailga xat yuborib bo'lmadi. Birozdan keyin qayta urinib ko'ring." };
  }
  return { ok: true };
}

export type CheckResult = "ok" | "wrong" | "expired" | "locked";

export async function checkCode(userId: string, code: string): Promise<CheckResult> {
  const [row] = await sql<{ id: number; code_hash: string; attempts: number; expired: boolean }>(
    `SELECT id, code_hash, attempts, expires_at < now() AS expired FROM email_codes
     WHERE user_id = $1 AND used_at IS NULL ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (!row || row.expired) return "expired";
  if (row.attempts >= MAX_ATTEMPTS) return "locked";
  if (row.code_hash !== hash(userId, code)) {
    await sql("UPDATE email_codes SET attempts = attempts + 1 WHERE id = $1", [row.id]);
    return row.attempts + 1 >= MAX_ATTEMPTS ? "locked" : "wrong";
  }
  await sql("UPDATE email_codes SET used_at = now() WHERE id = $1", [row.id]);
  await sql("UPDATE users SET email_verified_at = now() WHERE id = $1 AND email_verified_at IS NULL", [userId]);
  return "ok";
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
