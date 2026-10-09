"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Telefonda pastki tab paneli (iOS tab bar). Kompyuterda yashirin, CSS .tabbar.
const ICONS: Record<string, React.ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />,
  signals: <path d="M4 17l5-6 4 3 7-9M15 5h5v5" />,
  results: <path d="M5 20V10M12 20V4M19 20v-7" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
};

export default function TabBar({ signedIn }: { signedIn: boolean }) {
  const path = usePathname();
  const tabs = [
    { href: "/", label: "Asosiy", icon: "home" },
    { href: "/signallar", label: "Signallar", icon: "signals" },
    { href: "/natijalar", label: "Natijalar", icon: "results" },
    signedIn ? { href: "/kabinet", label: "Kabinet", icon: "user" } : { href: "/kirish", label: "Kirish", icon: "user" },
  ];
  return (
    <nav className="tabbar" aria-label="Asosiy bo'limlar">
      {tabs.map((t) => {
        const on = t.href === "/" ? path === "/" : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={on ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {ICONS[t.icon]}
            </svg>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
