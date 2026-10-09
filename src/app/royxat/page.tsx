import { redirect } from "next/navigation";
import AuthForm from "../components/AuthForm.tsx";
import { currentUser } from "@/lib/server/auth.ts";

export const metadata = { title: "Ro'yxatdan o'tish" };

export default async function RegisterPage() {
  if (await currentUser()) redirect("/kabinet");
  return (
    <main className="wrap">
      <AuthForm mode="register" />
    </main>
  );
}
