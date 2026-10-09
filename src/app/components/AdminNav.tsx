"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Admin bo'limlari menyusi. Havolalar serverda (maxfiy admin manzili bilan) tayyorlanadi.
export default function AdminNav({ items }: { items: { href: string; label: string; key: string }[] }) {
  const path = usePathname();
  const tail = (h: string) => new URL(h, "http://x").pathname.replace(/\/+$/, "");
  const current = items.filter((i) => i.key && path.replace(/\/+$/, "").endsWith(tail(i.href))).pop()?.key ?? "";
  return (
    <nav className="admin-nav" aria-label="Admin bo'limlari">
      {items.map((i) => (
        <Link key={i.key || "home"} href={i.href} aria-current={i.key === current ? "page" : undefined}>{i.label}</Link>
      ))}
    </nav>
  );
}
