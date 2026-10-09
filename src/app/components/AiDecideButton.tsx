"use client";
import { useActionState } from "react";
import { aiDecideNow } from "../actions.ts";

export default function AiDecideButton({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(aiDecideNow, null);
  return (
    <form action={action} className="bar" style={{ gap: 12 }}>
      {state?.msg && <span className="muted">{state.msg}</span>}
      <button className="btn gold sm" type="submit" disabled={pending || !enabled}>{pending ? "AI tahlil qilmoqda…" : "Hozir qaror so'rash"}</button>
    </form>
  );
}
