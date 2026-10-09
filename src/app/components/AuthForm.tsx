"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register, type FormState } from "../actions.ts";
import VerifyForm from "./VerifyForm.tsx";

export default function AuthForm({ mode }: { mode: "login" | "register" }) {
  const [state, action, pending] = useActionState<FormState, FormData>(mode === "login" ? login : register, {});
  if (state.step === "verify" && state.email) return <VerifyForm email={state.email} notice={state.ok} error={state.error} />;
  return (
    <form action={action} className="panel form auth">
      <h1 style={{ fontSize: "1.5rem" }}>{mode === "login" ? "Hisobga kirish" : "Ro'yxatdan o'tish"}</h1>
      {mode === "register" && (
        <label className="field">
          Ism
          <input id="name" name="name" autoComplete="name" key={`n${state.name ?? ""}`} defaultValue={state.name} />
        </label>
      )}
      <label className="field">
        Email
        <input id="email" name="email" type="email" required autoComplete="email" key={`e${state.email ?? ""}`} defaultValue={state.email} />
      </label>
      <label className="field">
        Parol
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={mode === "register" ? 8 : undefined}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {state.error && <p className="err">{state.error}</p>}
      <button className="btn gold" type="submit" disabled={pending}>
        {pending ? "Kuting…" : mode === "login" ? "Kirish" : "Hisob ochish"}
      </button>
      <p className="muted">
        {mode === "login" ? (
          <>Hisobingiz yo'qmi? <Link href="/royxat">Ro'yxatdan o'ting</Link></>
        ) : (
          <>Hisobingiz bormi? <Link href="/kirish">Kiring</Link></>
        )}
      </p>
    </form>
  );
}
