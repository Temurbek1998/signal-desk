import "server-only";

// Cron so'rovlari kaliti: Authorization: Bearer <CRON_SECRET>. null: ruxsat bor, aks holda sabab (kalitni oshkor qilmaydi).
export function cronDenied(req: Request): string | null {
  // Nusxalashda tushib qolgan probel, qo'shtirnoq, "Bearer" dan keyingi probel yoki undagi imlo xatosi xalaqit bermasin.
  const clean = (v: string) => v.trim().replace(/^["']|["']$/g, "").trim();
  const secret = clean(process.env.CRON_SECRET ?? "");
  const raw = clean(req.headers.get("authorization") ?? "");
  const token = raw === secret ? raw : clean(raw.replace(/^b[a-z]{3,6}r\s*/i, ""));
  if (secret && token === secret) return null;
  return !secret ? "Serverda CRON_SECRET yo'q" : !raw ? "Authorization sarlavhasi kelmadi" : "Kalit CRON_SECRET bilan mos emas";
}
