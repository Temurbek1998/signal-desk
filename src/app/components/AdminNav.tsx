"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; key: string };
type NavGroup = { label: string; items: NavItem[] };

export default function AdminNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const tail = (h: string) => new URL(h, "http://x").pathname.replace(/\/+$/, "");
  const allItems = groups.flatMap((g) => g.items);
  const current = allItems.filter((i) => i.key && path.replace(/\/+$/, "").endsWith(tail(i.href))).pop()?.key ?? "";

  return (
    <nav className="admin-nav" aria-label="Admin bo'limlari">
      {groups.map((g) => (
        <div key={g.label} className="admin-nav-group">
          <span className="admin-nav-label">{g.label}</span>
          <div className="admin-nav-items">
            {g.items.map((i) => (
              <Link
                key={i.key || "home"}
                href={i.href}
                aria-current={i.key === current ? "page" : undefined}
              >
                {i.label}
              </Link>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );
}
