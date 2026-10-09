"use client";

import { useEffect, useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };
const GREETING: Msg = { role: "assistant", content: "Salom! Men Signal Desk operatoriman. Obuna, signallar yoki robot haqida savolingiz bo'lsa yozing." };

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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

  return (
    <div className="chat">
      {open && (
        <section className="chat-box" aria-label="Operator bilan chat">
          <header className="chat-head">
            <div>
              <b>Operator</b>
              <span className="muted">AI yordamchi, odatda bir necha soniyada javob beradi</span>
            </div>
            <button className="chat-x" onClick={() => setOpen(false)} aria-label="Yopish">×</button>
          </header>
          <div className="chat-list" ref={list}>
            {msgs.map((m, i) => (
              <p key={i} className={`bubble ${m.role}`}>{m.content}</p>
            ))}
            {busy && <p className="bubble assistant muted">Yozmoqda…</p>}
            {error && <p className="err">{error}</p>}
          </div>
          <form className="chat-form" onSubmit={send}>
            <input
              id="chat-input"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Savolingizni yozing"
              maxLength={1500}
              autoComplete="off"
            />
            <button className="btn gold sm" type="submit" disabled={busy || !text.trim()}>Yuborish</button>
          </form>
        </section>
      )}
      <button className="chat-fab btn gold" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "Yopish" : "Operator"}
      </button>
    </div>
  );
}
