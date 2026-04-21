import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";

const SESSION_COOKIE_NAME = "postai_session";
const PUBLIC_PATHS        = ["/login", "/api/auth"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const token    = req.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (isPublic) {
    // Se já autenticado e tenta acessar /login → dashboard
    if (pathname === "/login" && token) {
      const payload = await verifySession(token);
      if (payload) return NextResponse.redirect(new URL("/", req.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const payload = await verifySession(token);

  if (!payload) {
    // Sessão inválida: limpa cookie e redireciona — quebra o loop
    const res = NextResponse.redirect(new URL("/login", req.url));
    res.cookies.delete(SESSION_COOKIE_NAME);
    return res;
  }

  // Injeta dados do usuário como headers para o layout consumir sem Admin SDK
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-user-uid",   payload.uid);
  requestHeaders.set("x-user-email", payload.email ?? "");
  requestHeaders.set("x-user-name",  payload.name  ?? "");

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)"],
};
