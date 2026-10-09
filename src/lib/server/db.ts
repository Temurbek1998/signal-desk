import "server-only";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// DATABASE_URL berilsa haqiqiy PostgreSQL (Neon, Supabase, o'z serveringiz) ishlatiladi.
// Berilmasa, lokal ishlab chiqish uchun .data/ papkasida o'rnatilgan PGlite (Postgres) ochiladi.

type Row = Record<string, unknown>;
export type Db = { query<T = Row>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> };

const g = globalThis as unknown as { __sdDb?: Promise<Db> };

async function open(): Promise<Db> {
  const schema = readFileSync(join(process.cwd(), "db/schema.sql"), "utf8");
  if (process.env.DATABASE_URL) {
    const { Pool } = await import("pg");
    const pool = new Pool({
      // Neon qatoridagi sslmode=require pg'da baribir verify-full degani; aniq yozilsa ogohlantirish chiqmaydi.
      connectionString: process.env.DATABASE_URL.replace(/([?&]sslmode=)(prefer|require|verify-ca)\b/, "$1verify-full"),
      ssl: process.env.DATABASE_SSL === "0" ? undefined : { rejectUnauthorized: false },
      max: 5,
    });
    await pool.query(schema);
    return pool as unknown as Db;
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const dir = process.env.PGLITE_DIR ?? join(process.cwd(), ".data/pglite");
  mkdirSync(dir, { recursive: true });
  const lite = new PGlite(dir);
  await lite.exec(schema);
  return lite as unknown as Db;
}

export function db(): Promise<Db> {
  g.__sdDb ??= open().catch((e) => {
    g.__sdDb = undefined;
    throw e;
  });
  return g.__sdDb;
}

export async function sql<T = Row>(text: string, params: unknown[] = []): Promise<T[]> {
  return (await (await db()).query<T>(text, params)).rows;
}
