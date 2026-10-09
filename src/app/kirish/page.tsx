import { redirect } from "next/navigation";
import AuthForm from "../components/AuthForm.tsx";
import { currentUser } from "@/lib/server/auth.ts";

export const metadata = { title: "Kirish" };

export default async function LoginPage() {
  if (await currentUser()) redirect("/signallar");
  return (
    <main className="wrap">
      <AuthForm mode="login" />
    </main>
  );
}
