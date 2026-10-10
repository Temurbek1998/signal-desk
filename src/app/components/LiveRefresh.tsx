"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Sahifani faqat oyna ko'rinib turganda yangilaydi: yashirin tabda narx so'rovlari (Twelve Data limiti) sarflanmaydi.
export default function LiveRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") router.refresh(); };
    const id = setInterval(tick, seconds * 1000);
    const onShow = () => { if (document.visibilityState === "visible") router.refresh(); };
    document.addEventListener("visibilitychange", onShow);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onShow); };
  }, [router, seconds]);
  return null;
}
