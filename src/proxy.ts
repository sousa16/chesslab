import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

// Protected routes that require authentication
const protectedRoutes = ["/home", "/repertoire", "/training", "/build", "/settings"];

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip API routes and static files
  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  // Check if route is protected
  const isProtectedRoute = protectedRoutes.some((route) => pathname.startsWith(route));

  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    // If user is logged in and trying to access splash page, redirect to home
    if (token && pathname === "/") {
      return NextResponse.redirect(new URL("/home", request.url));
    }

    // If no token on protected route, redirect to landing page
    if (isProtectedRoute && !token) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  } catch {
    // If token check fails on protected route, redirect to landing page
    if (isProtectedRoute) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
