import { redirect } from "next/navigation";
import Dashboard from "./Dashboard.tsx";
import { canSeeSignals, requireUser } from "@/lib/server/auth.ts";
import { activeCategories } from "@/lib/instruments.ts";

export const metadata = { title: "Signallar" };
export const dynamic = "force-dynamic";

export default async function SignalsPage() {
  const access = await requireUser();
  if (!canSeeSignals(access)) redirect("/kabinet");
  return <Dashboard categories={activeCategories()} />;
}
