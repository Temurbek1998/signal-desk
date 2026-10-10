"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };
const GREETING: Msg = { role: "assistant", content: "Salom! Men Zeus Number One operatoriman. Ro'yxatdan o'tish, tariflar, to'lov yoki obuna haqida so'rang. Muammo bo'lsa, \"Adminga murojaat\" tugmasini bosing." };

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ticket, setTicket] = useState(false);
  const [problem, setProblem] = useState("");
  const [contact, setContact] = useState("");
  const [sent, setSent] = useState("");
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [msgs, open, busy]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    const next = [...msgs, { role: "user" as const, content: q }];
    setMsgs(next);
    setText("");
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.filter((m) => m !== GREETING) }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Xatolik yuz berdi.");
      else setMsgs([...next, { role: "assistant", content: data.reply }]);
    } catch {
      setError("Internet aloqasini tekshirib, qayta yuboring.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTicket(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: problem, contact, chat: msgs.filter((m) => m !== GREETING) }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Xatolik yuz berdi.");
      else {
        setSent(`Murojaatingiz qabul qilindi (#${data.id}). Admin tez orada javob beradi.`);
        setProblem("");
        setTicket(false);
      }
    } catch {
      setError("Internet aloqasini tekshirib, qayta yuboring.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat">
      {open && (
        <section className="chat-box" aria-label="Operator bilan chat">
          <header className="chat-head">
            <div>
              <b>Operator</b>
              <span className="muted">Platforma bo&apos;yicha savollar</span>
            </div>
            <button className="chat-x" onClick={() => setOpen(false)} aria-label="Yopish">×</button>
          </header>
          <div className="chat-list" ref={list}>
            {msgs.map((m, i) => (
              <p key={i} className={`bubble ${m.role}`}>{m.content}</p>
            ))}
            {busy && <p className="bubble assistant muted">Yozmoqda…</p>}
            {sent && <p className="bubble assistant">{sent}</p>}
            {error && <p className="err">{error}</p>}
          </div>
          {ticket ? (
            <form className="chat-ticket" onSubmit={sendTicket}>
              <b>Adminga murojaat</b>
              <textarea value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="Muammoni yozing: nima bo'ldi, qachon" rows={3} maxLength={2000} required />
              <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Telegram yoki email (javob uchun)" maxLength={120} />
              <div className="chat-ticket-row">
                <button type="button" className="btn sm" onClick={() => setTicket(false)}>Bekor</button>
                <button className="btn gold sm" type="submit" disabled={busy || problem.trim().length < 5}>Yuborish</button>
              </div>
            </form>
          ) : (
            <button type="button" className="chat-help" onClick={() => { setTicket(true); setError(""); setSent(""); }}>Muammo bormi? Adminga murojaat</button>
          )}
          {!ticket && <form className="chat-form" onSubmit={send}>
            <input
              id="chat-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Savolingizni yozing"
              maxLength={1500}
              autoComplete="off"
            />
            <button className="btn gold sm" type="submit" disabled={busy || !text.trim()}>Yuborish</button>
          </form>}
        </section>
      )}
      <button className="chat-fab btn gold" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Yopish" : "Operator"}
      </button>
    </div>
  );
}
