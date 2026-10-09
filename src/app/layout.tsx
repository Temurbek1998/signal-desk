import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { logout } from "./actions.ts";
import ChatWidget from "./components/ChatWidget.tsx";
import LogoMark from "./components/Logo.tsx";
import TabBar from "./components/TabBar.tsx";
import { currentUser } from "@/lib/server/auth.ts";
import { adminHref } from "@/lib/adminPath.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Signal Desk", template: "%s · Signal Desk" },
  description: "Oltin (XAU/USD) uchun robot tahlili va savdo signallari",
  appleWebApp: { capable: true, title: "Signal Desk", statusBarStyle: "black-translucent" },
};

// iPhone: ekran chetigacha (notch va pastki chiziq hisobga olinadi), status bar rangi fonga mos.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050806",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser().catch(() => null);
  return (
    <html lang="uz">
      <body>
        <header className="site-head">
          <div className="in">
            <Link href="/" className="logo">
              <LogoMark />
              Signal Desk
            </Link>
            <nav className="nav">
              <Link href="/natijalar" className="hide-sm">Natijalar</Link>
              <Link href="/#narxlar" className="hide-sm">Narxlar</Link>
              {user ? (
                <>
                  {user.role === "admin" && <Link href={adminHref()}>Admin</Link>}
                  <Link href="/kabinet" className="tab-dup">Kabinet</Link>
                  <Link href="/signallar" className="btn gold sm">Signallar</Link>
                  <form action={logout}>
                    <button className="btn sm" type="submit">Chiqish</button>
                  </form>
                </>
              ) : (
                <>
                  <Link href="/kirish">Kirish</Link>
                  <Link href="/royxat" className="btn gold sm">Boshlash</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        {children}
        <footer className="site-foot">
          <div className="in">
            <p className="disclaimer">
              Signal Desk signallari texnik tahlil asosida avtomatik hisoblanadi va moliyaviy maslahat emas. Moliyaviy
              bozorlarda savdo yuqori xavf bilan bog'liq, kiritilgan mablag'ning bir qismi yoki hammasini yo'qotish
              mumkin. O'tgan natijalar kelajakdagi natijani kafolatlamaydi.
            </p>
            <p className="muted">© {new Date().getFullYear()} Signal Desk</p>
          </div>
        </footer>
        <ChatWidget />
        <TabBar signedIn={!!user} />
      </body>
    </html>
  );
}
