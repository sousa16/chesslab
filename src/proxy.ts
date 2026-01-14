import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";

const protectedRoutes = ["/", "/repertoire", "/training"];
const publicRoutes = ["/auth", "/api"];

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip API routes from middleware check
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Get the token
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  // Check if route is protected
  const isProtectedRoute = protectedRoutes.some((route) => {
    if (route === "/") {
      // Root only
      return pathname === "/";
    }
    return pathname.startsWith(route);
  });

  const isPublicRoute = pathname.startsWith("/auth");

  // If trying to access protected route without token, redirect to auth
  if (isProtectedRoute && !token) {
    return NextResponse.redirect(new URL("/auth", request.url));
  }

  // If already authenticated and trying to access /auth, redirect to home
  if (isPublicRoute && token) {
    return NextResponse.redirect(new URL("/", request.url));
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
