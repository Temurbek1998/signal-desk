import "server-only";
import { sql } from "./db.ts";
import type { PaidTier } from "../memory.ts";

export type Plan = { id: string; name: string; price_usdt: number; days: number; tier: PaidTier };

export async function listPlans(): Promise<Plan[]> {
  const rows = await sql<Plan>("SELECT id, name, price_usdt, days, tier FROM plans WHERE active AND price_usdt IS NOT NULL ORDER BY sort");
  return rows.map((p) => ({ ...p, price_usdt: Number(p.price_usdt) }));
}

// Obunani uzaytiradi: shu darajadagi faol obuna bo'lsa uning oxiridan, bo'lmasa hozirdan boshlab.
export async function grantSubscription(
  userId: string, planId: string | null, days: number, source: string, paymentId?: string, tier: PaidTier = "standard",
) {
  const [{ start }] = await sql<{ start: Date }>(
    "SELECT greatest(now(), coalesce(max(ends_at), now())) AS start FROM subscriptions WHERE user_id = $1 AND tier = $2",
    [userId, tier],
  );
  const starts = new Date(start);
  const ends = new Date(starts.getTime() + days * 86400_000);
  await sql(
    "INSERT INTO subscriptions (user_id, plan_id, starts_at, ends_at, source, payment_id, tier) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [userId, planId, starts, ends, source, paymentId ?? null, tier],
  );
  return ends;
}

export function formatUsdt(n: number | string) {
  const v = Number(n);
  return `${Number.isInteger(v) ? v : v.toFixed(2)} USDT`;
}

// USDT qabul qilinadigan tarmoqlar. Hamyon manzili berilmagan tarmoq ko'rsatilmaydi.
export type Network = { id: "TRC20" | "BEP20" | "ERC20"; label: string; address: string; tx: RegExp; explorer: string };

const NETWORKS: Omit<Network, "address">[] = [
  { id: "TRC20", label: "TRON (TRC20)", tx: /^[0-9a-f]{64}$/i, explorer: "https://tronscan.org/#/transaction/" },
  { id: "BEP20", label: "BNB Smart Chain (BEP20)", tx: /^0x[0-9a-f]{64}$/i, explorer: "https://bscscan.com/tx/" },
  { id: "ERC20", label: "Ethereum (ERC20)", tx: /^0x[0-9a-f]{64}$/i, explorer: "https://etherscan.io/tx/" },
];

export function networks(): Network[] {
  return NETWORKS.flatMap((n) => {
    const address = process.env[`USDT_${n.id}_ADDRESS`]?.trim();
    return address ? [{ ...n, address }] : [];
  });
}

export function explorerUrl(network: string | null, tx: string | null) {
  const n = NETWORKS.find((x) => x.id === network);
  return n && tx ? n.explorer + tx : null;
}
