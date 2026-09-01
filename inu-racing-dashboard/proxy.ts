import { type NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

// No guest access, no signup: unauthenticated users always land on /login.
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // Static assets (logo, icons) must stay reachable without a session cookie — browsers fetch
  // these outside the normal navigation/auth flow (favicon, PWA icons, <img> preloads).
  if (/\.(svg|png|jpe?g|gif|webp|ico|webmanifest|json)$/i.test(pathname)) {
    return NextResponse.next();
  }

  // getToken()'s secureCookie auto-detection reads request.nextUrl.protocol, which is always
  // "http:" behind this box's nginx (TLS terminates at nginx, plain HTTP to the Node process) —
  // same issue already hit and fixed in network-tutor-web/proxy.ts. Read x-forwarded-proto
  // directly instead of trusting the framework's own inference.
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const secureCookie = forwardedProto === "https" || request.nextUrl.protocol === "https:";

  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    secureCookie,
  });

  if (!token && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (token && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
