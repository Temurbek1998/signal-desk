// Admin panel manzili. Odatda /admin, lekin ishlab chiqarishda maxfiy manzil qo'yiladi:
//   ADMIN_PATH=qwert-7f3k9x2m  ->  https://domen.uz/qwert-7f3k9x2m
//   ADMIN_HOST=qwert.domen.uz  ->  https://qwert.domen.uz (DNS va COOKIE_DOMAIN=.domen.uz kerak)
// Ikkalasidan biri berilsa, oddiy /admin manzili "topilmadi" qaytaradi.

const clean = (s: string | undefined) => s?.trim().replace(/^\/+|\/+$/g, "") || undefined;

export function adminConfig(env: Record<string, string | undefined> = process.env) {
  return { path: clean(env.ADMIN_PATH), host: clean(env.ADMIN_HOST)?.toLowerCase() };
}

export function adminHref(sub = "", env: Record<string, string | undefined> = process.env): string {
  const { path, host } = adminConfig(env);
  if (host) return `https://${host}${sub || "/"}`;
  if (path) return `/${path}${sub}`;
  return `/admin${sub}`;
}

// So'rov manzilini ichki /admin yo'liga aylantiradi. null: o'zgartirish kerak emas. "hide": 404 qaytarish.
export function routeAdmin(hostHeader: string | null, pathname: string, env: Record<string, string | undefined> = process.env): string | "hide" | null {
  const { path, host } = adminConfig(env);
  const reqHost = hostHeader?.split(":")[0].toLowerCase();
  const isInternal = pathname === "/admin" || pathname.startsWith("/admin/");
  if (host && reqHost === host) {
    if (pathname === "/") return "/admin";
    if (["/robot", "/demo", "/sinov", "/tahlil", "/signallar", "/ai", "/ai/tahlil", "/mt5", "/operator"].includes(pathname)) return "/admin" + pathname;
  }
  if (path && (pathname === `/${path}` || pathname.startsWith(`/${path}/`))) {
    return "/admin" + pathname.slice(path.length + 1);
  }
  if ((path || host) && isInternal) return "hide";
  return null;
}
