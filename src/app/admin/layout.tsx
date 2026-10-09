import AdminNav from "../components/AdminNav.tsx";
import { adminHref } from "@/lib/adminPath.ts";
import { requireAdmin } from "@/lib/server/auth.ts";

const ITEMS = [
  { key: "", label: "Umumiy", sub: "" },
  { key: "tahlil", label: "Robot tahlili", sub: "/tahlil" },
  { key: "robot", label: "Robot logi", sub: "/robot" },
  { key: "signallar", label: "Signallar", sub: "/signallar" },
  { key: "demo", label: "Demo hisob", sub: "/demo" },
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
