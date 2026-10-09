import "server-only";
import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { sql } from "./db.ts";
import { PAID_TIERS, type Tier } from "../memory.ts";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
const COOKIE = "sd_session";
const SESSION_DAYS = 30;

export type User = { id: string; email: string; name: string; role: "user" | "admin" };
export type Access = { user: User; activeUntil: Date | null; tier: Tier | null };

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [algo, salt, key] = stored.split("$");
  if (algo !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64");
  const actual = await scrypt(pw, Buffer.from(salt, "base64"), expected.length);
  return timingSafeEqual(actual, expected);
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

export async function startSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await sql("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [sha(token), userId, expires]);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Admin alohida subdomenda (ADMIN_HOST) bo'lsa, kirish ikkala manzilda ham amal qilishi uchun, masalan ".domen.uz".
    domain: process.env.COOKIE_DOMAIN || undefined,
    expires,
  });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) await sql("DELETE FROM sessions WHERE token_hash = $1", [sha(token)]);
  jar.set(COOKIE, "", { path: "/", domain: process.env.COOKIE_DOMAIN || undefined, maxAge: 0 });
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const rows = await sql<User>(
    `SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.email_verified_at IS NOT NULL`,
    [sha(token)],
  );
  return rows[0] ?? null;
}

export async function activeUntil(userId: string): Promise<Date | null> {
  const rows = await sql<{ ends_at: Date }>(
    "SELECT max(ends_at) AS ends_at FROM subscriptions WHERE user_id = $1 AND starts_at <= now() AND ends_at > now()",
    [userId],
  );
  return rows[0]?.ends_at ? new Date(rows[0].ends_at) : null;
}

// Signallarni ko'rish huquqi: faol obuna yoki admin.
export async function getAccess(): Promise<Access | null> {
  const user = await currentUser();
  if (!user) return null;
  const until = await activeUntil(user.id);
  let tier: Access["tier"] = null;
  if (user.role === "admin") tier = "admin";
  else if (until) {
    // Bir nechta faol obuna bo'lsa, eng yuqori daraja amal qiladi.
    const rows = await sql<{ tier: Tier }>("SELECT DISTINCT tier FROM subscriptions WHERE user_id = $1 AND starts_at <= now() AND ends_at > now()", [user.id]);
    tier = [...PAID_TIERS].reverse().find((t) => rows.some((r) => r.tier === t)) ?? "standard";
  }
  return { user, activeUntil: until, tier };
}

export function canSeeSignals(a: Access | null) {
  return !!a && (a.user.role === "admin" || !!a.activeUntil);
}

export async function requireUser(): Promise<Access> {
  const a = await getAccess();
  if (!a) redirect("/kirish");
  return a;
}

// Admin bo'lmagan (yoki kirmagan) foydalanuvchiga admin sahifalari mavjud emasdek ko'rinadi.
export async function requireAdmin(): Promise<Access> {
  const a = await getAccess();
  if (!a || a.user.role !== "admin") notFound();
  return a;
}

// Admin harakatini SQL jurnalga yozadi.
export async function logAdmin(a: Access, action: string, target?: string | null, details = "") {
  await sql("INSERT INTO admin_log (admin_id, email, action, target, details) VALUES ($1, $2, $3, $4, $5)", [
    a.user.id, a.user.email, action, target ?? null, details.slice(0, 500),
  ]);
}
