"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { endSession, hashPassword, logAdmin, requireAdmin, requireUser, startSession, verifyPassword } from "@/lib/server/auth.ts";
import { grantSubscription, networks } from "@/lib/server/billing.ts";
import { PAID_TIERS, TIER_NAME, type PaidTier } from "@/lib/memory.ts";
import { sql } from "@/lib/server/db.ts";
import { checkCode, sendCode } from "@/lib/server/verify.ts";

export type FormState = { error?: string; ok?: string; email?: string; name?: string; step?: "verify" };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function register(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const name = String(form.get("name") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!EMAIL_RE.test(email)) return { error: "Email manzilini to'g'ri kiriting.", email, name };
  if (password.length < 8) return { error: "Parol kamida 8 belgidan iborat bo'lsin.", email, name };
  const [existing] = await sql<{ id: string; verified: boolean }>(
    "SELECT id, email_verified_at IS NOT NULL AS verified FROM users WHERE email = $1",
    [email],
  );
  if (existing?.verified) return { error: "Bu email bilan hisob allaqachon bor. Kirish sahifasidan foydalaning.", email, name };

  // Hisob email tasdiqlanmaguncha ochilmaydi. Tasdiqlanmagan eski urinish yangilanadi.
  const hash = await hashPassword(password);
  let id = existing?.id;
  if (id) {
    await sql("UPDATE users SET name = $2, password_hash = $3 WHERE id = $1", [id, name, hash]);
  } else {
    // ADMIN_EMAIL bilan ro'yxatdan o'tgan foydalanuvchi admin bo'ladi.
    const admin = process.env.ADMIN_EMAIL?.toLowerCase() === email;
    [{ id }] = await sql<{ id: string }>(
      "INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id",
      [email, name, hash, admin ? "admin" : "user"],
    );
  }
  const sent = await sendCode({ id: id!, email, name });
  if (!sent.ok) return { error: sent.error, email, name };
  return { step: "verify", email, ok: `${email} manziliga 6 xonali kod yubordik.` };
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const [user] = await sql<{ id: string; name: string; password_hash: string; verified: boolean }>(
    "SELECT id, name, password_hash, email_verified_at IS NOT NULL AS verified FROM users WHERE email = $1",
    [email],
  );
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return { error: "Email yoki parol noto'g'ri.", email };
  }
  if (!user.verified) {
    const sent = await sendCode({ id: user.id, email, name: user.name });
    if (sent.ok) return { step: "verify", email, ok: `Email hali tasdiqlanmagan. ${email} manziliga kod yubordik.` };
    // Kod hozirgina yuborilgan bo'lsa, o'shani kiritish kifoya.
    if (sent.cooldown) return { step: "verify", email, ok: `Email hali tasdiqlanmagan. ${email} manziliga yuborilgan kodni kiriting.` };
    return { step: "verify", email, error: sent.error };
  }
  await startSession(user.id);
  const [me] = await sql<{ role: string; name: string }>("SELECT role, name FROM users WHERE id = $1", [user.id]);
  if (me?.role === "admin") {
    await logAdmin({ user: { id: user.id, email, name: me.name, role: "admin" }, activeUntil: null, tier: "admin" }, "admin hisobiga kirdi").catch(() => {});
  }
  redirect("/signallar");
}

export async function verifyEmail(prev: FormState, form: FormData): Promise<FormState> {
  if (form.get("intent") === "resend") return resendCode(prev, form);
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const code = String(form.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { step: "verify", email, error: "Emailga kelgan 6 xonali kodni kiriting." };
  const [user] = await sql<{ id: string }>("SELECT id FROM users WHERE email = $1 AND email_verified_at IS NULL", [email]);
  if (!user) return { step: "verify", email, error: "Kod noto'g'ri yoki eskirgan." };
  const r = await checkCode(user.id, code);
  if (r === "wrong") return { step: "verify", email, error: "Kod noto'g'ri. Qayta tekshirib kiriting." };
  if (r === "expired") return { step: "verify", email, error: "Kod eskirgan. Yangi kod so'rang." };
  if (r === "locked") return { step: "verify", email, error: "Urinishlar tugadi. Yangi kod so'rang." };
  await startSession(user.id);
  redirect("/kabinet");
}

export async function resendCode(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const [user] = await sql<{ id: string; name: string }>("SELECT id, name FROM users WHERE email = $1 AND email_verified_at IS NULL", [email]);
  if (!user) return { step: "verify", email, error: "Bu email uchun kutilayotgan tasdiqlash yo'q." };
  const sent = await sendCode({ id: user.id, email, name: user.name });
  return sent.ok ? { step: "verify", email, ok: "Yangi kod yuborildi." } : { step: "verify", email, error: sent.error };
}

export async function logout() {
  await endSession();
  redirect("/");
}

// Foydalanuvchi to'lov qilganini bildiradi; admin tekshirib tasdiqlaydi.
export async function requestPayment(_: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireUser();
  const planId = String(form.get("plan") ?? "");
  const net = networks().find((n) => n.id === form.get("network"));
  const tx = String(form.get("tx") ?? "").trim();
  const note = String(form.get("note") ?? "").trim().slice(0, 300);
  const [plan] = await sql<{ price_usdt: string }>("SELECT price_usdt FROM plans WHERE id = $1 AND active AND price_usdt IS NOT NULL", [planId]);
  if (!plan) return { error: "Tarifni tanlang." };
  if (!net) return { error: "Tarmoqni tanlang." };
  if (!net.tx.test(tx)) {
    return { error: net.id === "TRC20" ? "TxID 64 belgidan iborat bo'ladi. Hamyondagi tranzaksiyadan nusxalang." : "Tx hash 0x bilan boshlanib, 66 belgidan iborat bo'ladi." };
  }
  const pending = await sql("SELECT 1 FROM payments WHERE user_id = $1 AND status = 'pending'", [user.id]);
  if (pending.length) return { error: "Oldingi to'lovingiz hali tekshirilmoqda." };
  const used = await sql("SELECT 1 FROM payments WHERE lower(tx_hash) = lower($1) AND status <> 'rejected'", [tx]);
  if (used.length) return { error: "Bu tranzaksiya allaqachon yuborilgan." };
  await sql(
    "INSERT INTO payments (user_id, plan_id, amount_uzs, amount_usdt, network, tx_hash, provider, note) VALUES ($1, $2, 0, $3, $4, $5, 'usdt', $6)",
    [user.id, planId, plan.price_usdt, net.id, tx, note],
  );
  revalidatePath("/kabinet");
  return { ok: "So'rov yuborildi. Admin hamyonni tekshirib tasdiqlagach obuna avtomatik yoqiladi." };
}

export async function approvePayment(form: FormData) {
  const admin = await requireAdmin();
  const id = String(form.get("id"));
  const [p] = await sql<{ user_id: string; plan_id: string; days: number; tier: PaidTier }>(
    `UPDATE payments SET status = 'paid', decided_at = now() FROM plans
     WHERE payments.id = $1 AND payments.status = 'pending' AND plans.id = payments.plan_id
     RETURNING payments.user_id, payments.plan_id, plans.days, plans.tier`,
    [id],
  );
  if (p) {
    await grantSubscription(p.user_id, p.plan_id, p.days, "manual", id, p.tier);
    const [u] = await sql<{ email: string }>("SELECT email FROM users WHERE id = $1", [p.user_id]);
    await logAdmin(admin, "to'lov tasdiqlandi", u?.email, `${p.plan_id}, to'lov ${id}`);
  }
  revalidatePath("/admin");
}

export async function rejectPayment(form: FormData) {
  const admin = await requireAdmin();
  const [p] = await sql<{ email: string; plan_id: string; id: string }>(
    `UPDATE payments SET status = 'rejected', decided_at = now() FROM users
     WHERE payments.id = $1 AND payments.status = 'pending' AND users.id = payments.user_id
     RETURNING users.email, payments.plan_id, payments.id`,
    [String(form.get("id"))],
  );
  if (p) await logAdmin(admin, "to'lov rad etildi", p.email, `${p.plan_id}, to'lov ${p.id}`);
  revalidatePath("/admin");
}

export async function grantManual(_: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const days = Number(form.get("days"));
  const tier = PAID_TIERS.find((t) => t === form.get("tier")) ?? "standard";
  if (!Number.isInteger(days) || days <= 0 || days > 3650) return { error: "Kunlar sonini to'g'ri kiriting." };
  const [user] = await sql<{ id: string }>("SELECT id FROM users WHERE email = $1", [email]);
  if (!user) return { error: "Bunday foydalanuvchi topilmadi." };
  const ends = await grantSubscription(user.id, null, days, "gift", undefined, tier);
  await logAdmin(admin, "qo'lda obuna berildi", email, `${TIER_NAME[tier]}, ${days} kun`);
  revalidatePath("/admin");
  return { ok: `${email} ${TIER_NAME[tier]} obunasi ${ends.toLocaleDateString("ru-RU")} gacha uzaytirildi.` };
}

export async function runRobotNow() {
  const admin = await requireAdmin();
  await logAdmin(admin, "robot qo'lda ishga tushirildi");
  const { runCycle } = await import("@/lib/server/runner.ts");
  await runCycle("admin");
  revalidatePath("/admin/robot");
}
