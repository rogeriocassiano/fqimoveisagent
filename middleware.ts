import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED = ["/admin", "/chat", "/api/agents", "/api/chat", "/api/agents/", "/api/properties"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(p));
  const isLogin = pathname === "/login";
  const token = request.cookies.get("sb-access-token")?.value;

  if (isProtected && !token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isLogin && token) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  if (pathname === "/") {
    return NextResponse.redirect(new URL(token ? "/admin" : "/login", request.url));
  }

  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|logo-fq.png).*)"] };
