import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

// 1. Define routes that require an active session
const protectedRoutes = ["/home", "/repertoire", "/training", "/build"];

/**
 * In Next.js 16+, 'middleware' has been renamed to 'proxy'.
 * This function must be named 'proxy' and exported.
 */
export async function proxy(request: NextRequest) {
  const { pathname, origin } = request.nextUrl;

  // 2. Performance optimization: Skip internal Next.js paths and API routes early
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.includes(".") // skips static files like favicon.ico, images, etc.
  ) {
    return NextResponse.next();
  }

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );

  try {
    // 3. Retrieve the JWT token
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    // Case A: User is logged in but tries to access the landing page ("/")
    if (token && pathname === "/") {
      return NextResponse.redirect(new URL("/home", origin));
    }

    // Case B: User is NOT logged in and tries to access a protected route
    if (isProtectedRoute && !token) {
      return NextResponse.redirect(new URL("/", origin));
    }
  } catch (error) {
    // Fallback: If token verification fails on a protected route, redirect to login
    if (isProtectedRoute) {
      return NextResponse.redirect(new URL("/", origin));
    }
  }

  // 4. Continue the request if no redirect conditions were met
  return NextResponse.next();
}

/**
 * Matcher allows you to filter which paths this proxy runs on.
 * This regex excludes static assets and public files for better performance.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (handled inside the function but good to exclude here too)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
