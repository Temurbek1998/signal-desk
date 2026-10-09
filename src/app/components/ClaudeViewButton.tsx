"use client";
import { useActionState } from "react";
import { claudeViewNow } from "../actions.ts";

export default function ClaudeViewButton({ pair, enabled }: { pair: string; enabled: boolean }) {
  const [state, action, pending] = useActionState(claudeViewNow, null);
  return (
    <form action={action} className="bar" style={{ gap: 12 }}>
      <input type="hidden" name="pair" value={pair} />
      {state?.msg && <span className="muted">{state.msg}</span>}
      <button className="btn gold sm" type="submit" disabled={pending || !enabled}>{pending ? "Claude tahlil qilmoqda…" : "Claude qayta tahlil qilsin"}</button>
    </form>
  );
}
