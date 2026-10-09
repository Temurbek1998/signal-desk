"use client";

import { startTransition, useActionState, useState } from "react";
import { requestPayment, type FormState } from "../actions.ts";

type Plan = { id: string; name: string; price: string };
type Net = { id: string; label: string; address: string };

export default function PaymentForm({ plans, networks, disabled }: { plans: Plan[]; networks: Net[]; disabled: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestPayment, {});
  const [planId, setPlan] = useState(plans[0]?.id);
  const [netId, setNet] = useState(networks[0]?.id);
  const [copied, setCopied] = useState(false);
  const plan = plans.find((p) => p.id === planId);
  const net = networks.find((n) => n.id === netId);

  if (!networks.length) return <p className="notice">USDT hamyon manzili hali qo'shilmagan. Admin bilan bog'laning.</p>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(net!.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    // onSubmit: React forma maydonlarini xatodan keyin tozalab yubormasligi uchun (tanlangan tarif saqlanadi).
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <label className="field">
        Tarif
        <select id="plan" name="plan" value={planId} onChange={(e) => setPlan(e.target.value)}>
          {plans.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}: {p.price}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        Tarmoq
        <select id="network" name="network" value={netId} onChange={(e) => setNet(e.target.value)}>
          {networks.map((n) => (
            <option key={n.id} value={n.id}>{n.label}</option>
          ))}
        </select>
      </label>

      {net && plan && (
        <div className="pay-box">
          <div className="pay-row"><span>O'tkazing</span><b className="mono">{plan.price}</b></div>
          <div className="pay-row"><span>Tarmoq</span><b>{net.label}</b></div>
          <div className="pay-addr">
            <span>Hamyon manzili</span>
            <code id="wallet" className="mono">{net.address}</code>
            <button type="button" className="btn sm" style={{ color: "var(--fg)" }} onClick={copy}>
              {copied ? "Nusxalandi" : "Nusxalash"}
            </button>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Faqat USDT va faqat {net.id} tarmog'i orqali yuboring. Boshqa tarmoq yoki boshqa tanga yuborilsa, mablag' yo'qolishi mumkin.
            Birja komissiyasini hisobga oling: hamyonga to'liq {plan.price} kelib tushishi kerak.
          </p>
        </div>
      )}

      <label className="field">
        Tranzaksiya ID (TxID / hash)
        <input id="tx" name="tx" required spellCheck={false} autoComplete="off" placeholder={netId === "TRC20" ? "64 belgili TxID" : "0x bilan boshlanadigan hash"} className="mono" />
      </label>
      <label className="field">
        Izoh (ixtiyoriy)
        <input id="note" name="note" maxLength={300} placeholder="Masalan: Binance'dan yubordim" />
      </label>
      {state.error && <p className="err">{state.error}</p>}
      {state.ok && <p className="okmsg">{state.ok}</p>}
      <button className="btn gold" type="submit" disabled={pending || disabled}>
        {pending ? "Yuborilmoqda…" : "To'lov qildim"}
      </button>
    </form>
  );
}
