import AdminNav from "../components/AdminNav.tsx";
import { adminHref } from "@/lib/adminPath.ts";
import { requireAdmin } from "@/lib/server/auth.ts";
import { demoDataIgnored, isDemoData } from "@/lib/demoMode.ts";
import { APP_COMMIT, APP_VERSION } from "@/lib/version.ts";
import { GROUPS } from "./navGroups.ts";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  const groups = GROUPS.map((g) => ({
    label: g.label,
    items: g.items.map((i) => ({ key: i.key, label: i.label, href: adminHref(i.sub) })),
  }));
  return (
    <>
      <AdminNav groups={groups} />
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
