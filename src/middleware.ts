import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const CHANGE_PASSWORD_PATH = "/dashboard/change-password";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const { pathname } = req.nextUrl;

  if (pathname.startsWith("/dashboard") && !isLoggedIn) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-created accounts (see createAgentAction) start with
  // mustChangePassword: true — block every other /dashboard/* route
  // server-side until they've set their own password, the same way the
  // login gate above is enforced (not just a client-side redirect).
  // mustChangePassword travels on the session JWT (see src/lib/auth.ts),
  // so this needs no extra DB round-trip per request.
  if (isLoggedIn && pathname.startsWith("/dashboard") && pathname !== CHANGE_PASSWORD_PATH) {
    if (req.auth?.user?.mustChangePassword) {
      return NextResponse.redirect(new URL(CHANGE_PASSWORD_PATH, req.nextUrl.origin));
    }
  }
});

export const config = {
  matcher: ["/dashboard/:path*"],
};
