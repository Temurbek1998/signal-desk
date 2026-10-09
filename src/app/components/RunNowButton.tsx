"use client";

import { useFormStatus } from "react-dom";

export default function RunNowButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn gold sm" type="submit" disabled={pending}>
      {pending ? "Robot ishlamoqda…" : "Hozir ishga tushirish"}
    </button>
  );
}
