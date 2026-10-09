"use client";

import { useActionState } from "react";
import { verifyEmail, type FormState } from "../actions.ts";

export default function VerifyForm({ email, notice, error }: { email: string; notice?: string; error?: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(verifyEmail, { ok: notice, error });
  return (
    <form action={action} className="panel form auth">
      <h1 style={{ fontSize: "1.5rem" }}>Emailni tasdiqlang</h1>
      {state.ok && <p className="okmsg">{state.ok}</p>}
      <p className="muted">
        <b>{email}</b> manziliga kelgan 6 xonali kodni kiriting. Xat ko'rinmasa, Spam papkasini tekshiring.
      </p>
      <input type="hidden" name="email" value={email} />
      <label className="field">
        Tasdiqlash kodi
        <input
          id="code"
          name="code"
          required
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]{6,7}"
          maxLength={7}
          placeholder="123456"
          className="code-input"
          autoFocus
        />
      </label>
      {state.error && <p className="err">{state.error}</p>}
      <button className="btn gold" type="submit" name="intent" value="verify" disabled={pending}>
        {pending ? "Kuting…" : "Tasdiqlash"}
      </button>
      <button className="btn" style={{ color: "var(--fg)" }} type="submit" name="intent" value="resend" formNoValidate disabled={pending}>
        Kodni qayta yuborish
      </button>
    </form>
  );
}
