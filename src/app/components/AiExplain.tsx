"use client";
import { useActionState } from "react";
import { aiExplain } from "../actions.ts";

export default function AiExplain({ pair, tf, enabled }: { pair: string; tf: string; enabled: boolean }) {
  const [state, action, pending] = useActionState(aiExplain, null);
  return (
    <form action={action} className="form">
      <input type="hidden" name="pair" value={pair} />
      <input type="hidden" name="tf" value={tf} />
      <div className="bar">
        <p className="muted" style={{ margin: 0 }}>
          {enabled ? "AI robotning hisoblarini so'z bilan tushuntiradi. U signal bermaydi, signal faqat robot qoidalaridan chiqadi."
            : "AI hali ulanmagan: Vercel'da ANTHROPIC_API_KEY qo'shilsa yoqiladi."}
        </p>
        <button className="btn gold sm" type="submit" disabled={pending || !enabled}>{pending ? "AI o'ylamoqda…" : "AI izohi"}</button>
      </div>
      {state?.text && <p className="ai-box">{state.text}</p>}
      {state?.error && <p className="err">{state.error}</p>}
    </form>
  );
}
