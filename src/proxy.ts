import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const protectedRoutes = ["/home", "/repertoire", "/training", "/build"];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );

  const origin = request.nextUrl.origin;

  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (token && pathname === "/") {
      return NextResponse.redirect(new URL("/home", origin));
    }

    if (isProtectedRoute && !token) {
      return NextResponse.redirect(new URL("/", origin));
    }
  } catch {
    if (isProtectedRoute) {
      return NextResponse.redirect(new URL("/", origin));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
