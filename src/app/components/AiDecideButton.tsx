"use client";
import { useActionState } from "react";
import { aiDecideNow } from "../actions.ts";

export default function AiDecideButton({ enabled, swing = false }: { enabled: boolean; swing?: boolean }) {
  const [state, action, pending] = useActionState(aiDecideNow, null);
  return (
    <form action={action} className="bar" style={{ gap: 12 }}>
      {swing && <input type="hidden" name="mode" value="swing" />}
      {state?.msg && <span className="muted">{state.msg}</span>}
      <button className="btn gold sm" type="submit" disabled={pending || !enabled}>{pending ? "AI tahlil qilmoqda…" : swing ? "Swing qaror so'rash" : "Hozir qaror so'rash"}</button>
    </form>
  );
}
