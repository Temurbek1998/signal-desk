"use client";
import { useActionState } from "react";
import { newsAnalyzeNow } from "../actions.ts";

export default function NewsNowButton({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(newsAnalyzeNow, null);
  return (
    <form action={action} className="bar" style={{ gap: 12 }}>
      {state?.msg && <span className="muted">{state.msg}</span>}
      <button className="btn gold sm" type="submit" disabled={pending || !enabled}>{pending ? "Claude M1 ni tahlil qilmoqda…" : "Oxirgi yangilikni hozir tahlil qil"}</button>
    </form>
  );
}
