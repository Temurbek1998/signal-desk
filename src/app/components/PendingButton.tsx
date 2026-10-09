"use client";

import { useFormStatus } from "react-dom";

export default function PendingButton({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return <button className="btn gold sm" type="submit" disabled={pending}>{pending ? busy : label}</button>;
}
