// Sun'iy narxlar (DEMO_DATA=1) faqat lokal sinov uchun. Vercel production'da hech qachon yoqilmaydi:
// aks holda robot va Claude soxta shamlarni tahlil qiladi (2026-10-10 da shunday bo'lgan, narx ~2500 ko'ringan).
export const isDemoData = () => process.env.DEMO_DATA === "1" && process.env.VERCEL_ENV !== "production";
// DEMO_DATA o'rnatilgan, lekin production'da e'tiborsiz qoldirilyapti: admin ogohlantirishi uchun.
export const demoDataIgnored = () => process.env.DEMO_DATA === "1" && process.env.VERCEL_ENV === "production";
