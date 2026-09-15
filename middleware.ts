import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Rotas que exigem login e NÃO são acessíveis para trainees
const PROTECTED = ["/admin", "/chat", "/api/agents", "/api/chat", "/api/properties", "/api/users", "/api/files", "/api/extract", "/api/settings", "/api/whatsapp"];
// Rotas que exigem login e SÃO acessíveis para trainees
const TRAINEE_ALLOWED = ["/academy", "/api/roleplay", "/api/academy"];
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

function matches(pathname: string, prefixes: string[]) {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function tokenExpired(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" && payload.exp * 1000 < Date.now() + 10_000;
  } catch {
    return true;
  }
}

async function refreshSession(refreshToken: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: key },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) return null;
    return (await res.json()) as { access_token?: string; refresh_token?: string };
  } catch {
    return null;
  }
}

// Aplica a sessão renovada: no header da request (para os route handlers
// enxergarem o novo token) e nos cookies da response (para o navegador).
function applyRefreshedSession(request: NextRequest, response: NextResponse, accessToken: string, refreshToken: string, isRedirect: boolean) {
  let final = response;
  if (!isRedirect) {
    const cookies = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((c) => c.trim())
      .filter((c) => c && !c.startsWith("sb-access-token=") && !c.startsWith("sb-refresh-token="));
    cookies.push(`sb-access-token=${accessToken}`, `sb-refresh-token=${refreshToken}`);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("cookie", cookies.join("; "));
    final = NextResponse.next({ request: { headers: requestHeaders } });
    for (const [k, v] of response.headers) final.headers.set(k, v);
  }
  final.cookies.set("sb-access-token", accessToken, { path: "/", maxAge: COOKIE_MAX_AGE });
  final.cookies.set("sb-refresh-token", refreshToken, { path: "/", maxAge: COOKIE_MAX_AGE });
  return final;
}

function clearSessionCookies(response: NextResponse) {
  for (const name of ["sb-access-token", "sb-refresh-token", "sb-role"]) response.cookies.set(name, "", { path: "/", maxAge: 0 });
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith("/api/");
  const isProtected = matches(pathname, PROTECTED);
  const isTraineeAllowed = matches(pathname, TRAINEE_ALLOWED);
  const isLogin = pathname === "/login";
  let token = request.cookies.get("sb-access-token")?.value;
  const refreshToken = request.cookies.get("sb-refresh-token")?.value;
  const role = request.cookies.get("sb-role")?.value;
  const isTrainee = role === "trainee";
  const needsAuth = isProtected || isTraineeAllowed;

  let refreshed: { access_token?: string; refresh_token?: string } | null = null;
  if (token && tokenExpired(token)) {
    token = undefined;
    if (refreshToken) {
      refreshed = await refreshSession(refreshToken);
      if (refreshed?.access_token) token = refreshed.access_token;
    }
  }

  if (!token && needsAuth) {
    if (isApi) return clearSessionCookies(NextResponse.json({ error: "Não autenticado" }, { status: 401 }));
    return clearSessionCookies(NextResponse.redirect(new URL("/login", request.url)));
  }

  const finish = (response: NextResponse, isRedirect = false) =>
    refreshed?.access_token && refreshed.refresh_token
      ? applyRefreshedSession(request, response, refreshed.access_token, refreshed.refresh_token, isRedirect)
      : response;

  if (isTrainee && isProtected) {
    if (isApi) return NextResponse.json({ error: "Acesso restrito à Academia de Vendas" }, { status: 403 });
    return finish(NextResponse.redirect(new URL("/academy", request.url)), true);
  }

  if (isLogin && token) {
    return finish(NextResponse.redirect(new URL(isTrainee ? "/academy" : "/admin", request.url)), true);
  }

  if (pathname === "/") {
    return finish(NextResponse.redirect(new URL(token ? (isTrainee ? "/academy" : "/admin") : "/login", request.url)), true);
  }

  return finish(NextResponse.next());
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|logo-fq.png).*)"] };
