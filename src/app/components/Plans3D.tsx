"use client";
import { useEffect, useRef, useState } from "react";

// Tarif kartalari 3D: sichqoncha bilan qiyshayadi, ichidagi qatlamlar turli chuqurlikda turadi.
// Telefonda kartalar yonma-yon suriladi (snap), PRO o'rtada ochiladi, pastda nuqtalar ko'rsatkichi.
export function PlansRow({ children, count, start = 1 }: { children: React.ReactNode; count: number; start?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(start);
  useEffect(() => {
    const el = ref.current;
    if (!el || el.scrollWidth <= el.clientWidth) return;
    const card = el.children[start] as HTMLElement | undefined;
    if (card) el.scrollLeft = card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2;
  }, [start]);
  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const mid = el.scrollLeft + el.clientWidth / 2;
    let best = 0, dist = Infinity;
    Array.from(el.children).forEach((c, i) => {
      const h = c as HTMLElement;
      const d = Math.abs(h.offsetLeft + h.offsetWidth / 2 - mid);
      if (d < dist) { dist = d; best = i; }
    });
    setActive(best);
  };
  const go = (i: number) => {
    const el = ref.current;
    const card = el?.children[i] as HTMLElement | undefined;
    if (el && card) el.scrollTo({ left: card.offsetLeft - (el.clientWidth - card.offsetWidth) / 2, behavior: "smooth" });
  };
  return (
    <>
      <div ref={ref} className="plans tiers" onScroll={onScroll}>{children}</div>
      <div className="plan-dots" role="tablist" aria-label="Tariflar">
        {Array.from({ length: count }, (_, i) => (
          <button key={i} type="button" role="tab" aria-selected={i === active} aria-label={`${i + 1}-tarif`} onClick={() => go(i)} />
        ))}
      </div>
    </>
  );
}

export function TiltCard({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--ry", `${(x - 0.5) * 16}deg`);
    el.style.setProperty("--rx", `${(0.5 - y) * 12}deg`);
    el.style.setProperty("--gx", `${x * 100}%`);
    el.style.setProperty("--gy", `${y * 100}%`);
    el.dataset.hover = "1";
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--rx", "0deg");
    delete el.dataset.hover;
  };
  return (
    <div className="plan-wrap">
      <div ref={ref} className={className} onPointerMove={move} onPointerLeave={leave}>{children}</div>
    </div>
  );
}
