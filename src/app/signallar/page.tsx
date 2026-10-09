import { redirect } from "next/navigation";
import Dashboard from "./Dashboard.tsx";
import { canSeeSignals, requireUser } from "@/lib/server/auth.ts";
import { activeCategories, publicCategories } from "@/lib/instruments.ts";

export const metadata = { title: "Signallar" };
export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const access = await requireUser();
  if (!canSeeSignals(access)) redirect("/kabinet");
  // Admin robot ishlayotgan barcha bozorlarni ko'radi, mijoz faqat ochiq bozorlarni.
  const pub = publicCategories();
  return <Dashboard categories={access.tier === "admin" ? activeCategories() : activeCategories().filter((c) => pub.includes(c))} />;
}
