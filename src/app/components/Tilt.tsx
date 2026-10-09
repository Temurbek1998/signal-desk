"use client";
import { useRef } from "react";

// Sichqoncha yoki barmoq holatiga qarab ichidagi 3D sahnani biroz qiyshaytiradi (--px, --py: -1..1).
export default function Tilt({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--px", (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(3));
    el.style.setProperty("--py", (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(3));
  };
  const leave = () => {
    ref.current?.style.setProperty("--px", "0");
    ref.current?.style.setProperty("--py", "0");
  };
  return (
    <div ref={ref} className={className} onPointerMove={move} onPointerLeave={leave}>
      <div className="c3-tilt">{children}</div>
    </div>
  );
}
