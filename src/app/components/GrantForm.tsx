"use client";

import { useActionState } from "react";
import { grantManual, type FormState } from "../actions.ts";

export default function GrantForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(grantManual, {});
  return (
    <form action={action} className="form" style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-end" }}>
      <label className="field" style={{ flex: "2 1 220px" }}>
        Foydalanuvchi emaili
        <input id="grant-email" name="email" type="email" required />
      </label>
      <label className="field" style={{ flex: "1 1 100px" }}>
        Kun
        <input id="grant-days" name="days" type="number" min={1} max={3650} defaultValue={30} required />
      </label>
      <label className="field" style={{ flex: "1 1 120px" }}>
        Tarif
        <select id="grant-tier" name="tier" defaultValue="standard">
          <option value="standard">Standart</option>
          <option value="pro">PRO</option>
          <option value="vip">VIP</option>
        </select>
      </label>
      <button className="btn gold" type="submit" disabled={pending}>Obuna berish</button>
      {state.error && <p className="err" style={{ flexBasis: "100%" }}>{state.error}</p>}
      {state.ok && <p className="okmsg" style={{ flexBasis: "100%" }}>{state.ok}</p>}
    </form>
  );
}
