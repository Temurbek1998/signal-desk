import { NextResponse, type NextRequest } from "next/server";
import { routeAdmin } from "./lib/adminPath.ts";

export function middleware(req: NextRequest) {
  const target = routeAdmin(req.headers.get("host"), req.nextUrl.pathname);
  if (!target) return NextResponse.next();
  const url = req.nextUrl.clone();
  // Oddiy /admin manzili mavjud emasdek ko'rinadi (404).
  url.pathname = target === "hide" ? "/__topilmadi" : target;
  return NextResponse.rewrite(url);
}

export const config = { matcher: ["/((?!_next/|favicon|api/).*)"] };
