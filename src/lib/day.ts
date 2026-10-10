// Toshkent kuni (UTC+5, yozgi vaqt yo'q). Admin jurnallarida faqat bugungi kun, oldingilari "Kunlik arxiv"da.
export const TZ_SQL = "interval '5 hours'";
export const tashDay = (d: Date | string | number) => new Date(new Date(d).getTime() + 5 * 3600_000).toISOString().slice(0, 10);
// SQL sharti: ustun Toshkent bo'yicha bugungi kunda.
export const todaySql = (col: string) => `(${col} + ${TZ_SQL})::date = (now() + ${TZ_SQL})::date`;
export const isDay = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
