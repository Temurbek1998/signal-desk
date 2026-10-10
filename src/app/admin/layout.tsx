import AdminNav from "../components/AdminNav.tsx";
import { adminHref } from "@/lib/adminPath.ts";
import { requireAdmin } from "@/lib/server/auth.ts";

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
      {children}
    </>
  );
}
