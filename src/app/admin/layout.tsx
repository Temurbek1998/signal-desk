import AdminNav from "../components/AdminNav.tsx";
import { adminHref } from "@/lib/adminPath.ts";
import { requireAdmin } from "@/lib/server/auth.ts";
import { demoDataIgnored, isDemoData } from "@/lib/demoMode.ts";
import { APP_COMMIT, APP_VERSION } from "@/lib/version.ts";

const ITEMS = [
  { key: "", label: "Umumiy", sub: "" },
  { key: "pult", label: "Signal pulti", sub: "/pult" },
  { key: "tahlil", label: "Robot + Claude", sub: "/tahlil" },
  { key: "robot", label: "Robot logi", sub: "/robot" },
  { key: "signallar", label: "Signallar", sub: "/signallar" },
  { key: "jonli", label: "Jonli savdolar", sub: "/jonli" },
  { key: "ai", label: "AI treyder", sub: "/ai" },
  { key: "yangiliklar", label: "Yangiliklar M1", sub: "/yangiliklar" },
  { key: "impuls", label: "Yangilik impulslari", sub: "/impuls" },
  { key: "keskin", label: "Keskin harakatlar", sub: "/keskin" },
  { key: "demo", label: "Demo hisob", sub: "/demo" },
  { key: "mt5", label: "MT5 avtosavdo", sub: "/mt5" },
  { key: "operator", label: "Operator", sub: "/operator" },
  { key: "sinov", label: "Bozorlar sinovi", sub: "/sinov" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <AdminNav items={ITEMS.map((i) => ({ key: i.key, label: i.label, href: adminHref(i.sub) }))} />
      {(isDemoData() || demoDataIgnored()) && (
        <p className="wrap notice warn" style={{ marginTop: 12 }}>
          {isDemoData()
            ? "DEMO_DATA=1: sayt sun'iy narxlar bilan ishlayapti (faqat lokal sinov uchun)."
            : "Vercel'da DEMO_DATA=1 turibdi. Production'da u e'tiborsiz qoldiriladi va haqiqiy narxlar olinadi, lekin uni Environment Variables dan o'chirib qo'ying."}
        </p>
      )}
      {children}
      <p className="wrap muted" style={{ fontSize: "0.8rem", marginTop: 24 }}>
        Versiya v{APP_VERSION}{APP_COMMIT ? ` · ${APP_COMMIT}` : ""}
      </p>
    </>
  );
}
