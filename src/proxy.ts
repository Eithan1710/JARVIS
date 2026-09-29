import { NextResponse, type NextRequest } from "next/server";
import { authRequired, SESSION_COOKIE, verifySessionToken } from "@/server/auth/session";

const PUBLIC = [/^\/unlock/, /^\/offline/, /^\/api\/auth\/unlock/, /^\/api\/ingest\//, /^\/api\/cron\//, /^\/api\/health/];

/** Gate every page and API route behind the single-user session. */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some((re) => re.test(pathname)) || !authRequired()) return NextResponse.next();
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (session) return NextResponse.next();
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: { code: "unauthorized", message: "נדרשת כניסה מחדש" } }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = "/unlock";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Static assets, the service worker and the manifest are always public.
  matcher: ["/((?!_next/static|_next/image|icons/|sw\\.js|manifest\\.webmanifest|favicon\\.ico|robots\\.txt|apple-touch-icon.*\\.png).*)"],
};
